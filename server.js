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

const s3 = new AWS.S3({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION,
});

async function getBucketBaseUrl() {
    const config = await Config.findOne({ where: { key: "S3_BUCKET_URL" } });
    return config?.value || "";
}

async function uploadToS3(file, key) {
    const params = {
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: key,
        Body: file.buffer,
    };
    await s3.upload(params).promise();
    return key;
}

async function deleteFromS3(key) {
    const params = {
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: key,
    };
    await s3.deleteObject(params).promise();
}

app.post("/products", upload.single("image"), async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
        const { name, description } = req.body;
        const file = req.file;

        // Crear el producto sin imagen para obtener el ID
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
            // Borrar imagen anterior si existe
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

app.delete("/products/:id", async (req, res) => {
    try {
        const product = await Product.findByPk(req.params.id);
        if (!product) {
            return res.status(404).json({ error: "Producto no encontrado" });
        }

        // Eliminar imagen del bucket si existe
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
