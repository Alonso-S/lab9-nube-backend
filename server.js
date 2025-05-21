require("dotenv").config();
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const AWS = require("aws-sdk");
const { Product, Config, sequelize } = require("./models");

const app = express();
const upload = multer();
app.use(cors());
app.use(express.json());

// Configurar AWS SDK con credenciales y región (pero sin el bucket aquí)
const s3 = new AWS.S3({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION,
});

// Obtener la URL base del bucket desde la tabla Configs
async function getBucketBaseUrl() {
    const config = await Config.findOne({ where: { key: "S3_BUCKET_URL" } });
    return config?.value || "";
}

// Extraer solo el nombre del bucket desde la URL
function extractBucketNameFromUrl(url) {
    const match = url.match(/^https?:\/\/([^\.]+)\.s3\./);
    return match ? match[1] : null;
}

// Subir archivo a S3
async function uploadToS3(file, key) {
    const bucketUrl = await getBucketBaseUrl();
    const bucketName = extractBucketNameFromUrl(bucketUrl);
    if (!bucketName) {
        throw new Error("No se pudo obtener el nombre del bucket desde la URL");
    }

    const params = {
        Bucket: bucketName,
        Key: key,
        Body: file.buffer,
    };
    await s3.upload(params).promise();
    return key;
}

// Eliminar archivo de S3
async function deleteFromS3(key) {
    const bucketUrl = await getBucketBaseUrl();
    const bucketName = extractBucketNameFromUrl(bucketUrl);
    if (!bucketName) {
        throw new Error("No se pudo obtener el nombre del bucket desde la URL");
    }

    const params = {
        Bucket: bucketName,
        Key: key,
    };
    await s3.deleteObject(params).promise();
}

// Crear producto
app.post("/products", upload.single("image"), async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
        const { name, description } = req.body;
        const file = req.file;

        const product = await Product.create({ name, description }, {
            transaction,
        });

        let image_path = null;
        if (file) {
            const extension = file.originalname.split(".").pop();
            const key = `imagenes/producto${product.id}.${extension}`;
            await uploadToS3(file, key);
            image_path = key;

            await product.update({ image_path }, { transaction });
        }

        await transaction.commit();

        const bucketUrl = await getBucketBaseUrl();
        res.status(201).json({
            ...product.toJSON(),
            full_image_url: image_path ? `${bucketUrl}${image_path}` : null,
        });
    } catch (error) {
        await transaction.rollback();
        console.error("Error al crear producto:", error);
        res.status(500).json({ error: "Error al crear el producto" });
    }
});

// Obtener todos los productos
app.get("/products", async (req, res) => {
    try {
        const bucketUrl = await getBucketBaseUrl();
        const products = await Product.findAll();
        const result = products.map((p) => ({
            ...p.toJSON(),
            full_image_url: p.image_path ? `${bucketUrl}${p.image_path}` : null,
        }));
        res.json(result);
    } catch (error) {
        console.error("Error al obtener productos:", error);
        res.status(500).json({ error: "Error al obtener productos" });
    }
});

// Obtener un producto por ID
app.get("/products/:id", async (req, res) => {
    try {
        const product = await Product.findByPk(req.params.id);
        if (!product) {
            return res.status(404).json({ error: "Producto no encontrado" });
        }

        const bucketUrl = await getBucketBaseUrl();
        res.json({
            ...product.toJSON(),
            full_image_url: product.image_path
                ? `${bucketUrl}${product.image_path}`
                : null,
        });
    } catch (error) {
        console.error("Error al obtener producto:", error);
        res.status(500).json({ error: "Error al obtener producto" });
    }
});

// Actualizar producto
app.put("/products/:id", upload.single("image"), async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
        const { name, description } = req.body;
        const file = req.file;

        const product = await Product.findByPk(req.params.id);
        if (!product) {
            return res.status(404).json({ error: "Producto no encontrado" });
        }

        let image_path = product.image_path;

        if (file) {
            // Eliminar imagen anterior si existe
            if (image_path) {
                await deleteFromS3(image_path);
            }

            const extension = file.originalname.split(".").pop();
            const key = `imagenes/producto${product.id}.${extension}`;
            await uploadToS3(file, key);
            image_path = key;
        }

        await product.update({ name, description, image_path }, {
            transaction,
        });
        await transaction.commit();

        const bucketUrl = await getBucketBaseUrl();
        res.json({
            ...product.toJSON(),
            full_image_url: image_path ? `${bucketUrl}${image_path}` : null,
        });
    } catch (error) {
        await transaction.rollback();
        console.error("Error al actualizar producto:", error);
        res.status(500).json({ error: "Error al actualizar producto" });
    }
});

// Eliminar producto
app.delete("/products/:id", async (req, res) => {
    try {
        const product = await Product.findByPk(req.params.id);
        if (!product) {
            return res.status(404).json({ error: "Producto no encontrado" });
        }

        if (product.image_path) {
            await deleteFromS3(product.image_path);
        }

        await product.destroy();
        res.json({ message: "Producto eliminado" });
    } catch (error) {
        console.error("Error al eliminar producto:", error);
        res.status(500).json({ error: "Error al eliminar producto" });
    }
});

// Iniciar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
    try {
        await sequelize.authenticate();
        console.log("🟢 Base de datos conectada");
        console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
    } catch (error) {
        console.error("🔴 Error al conectar la base de datos:", error);
    }
});
