"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.bulkInsert("Products", [
      {
        name: "Producto 1",
        description: "Descripción del producto 1",
        image_path: "imagenes/producto1.jpg",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        name: "Producto 2",
        description: "Descripción del producto 2",
        image_path: "imagenes/producto2.jpg",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        name: "Producto 3",
        description: "Descripción del producto 3",
        image_path: "imagenes/producto3.jpg",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ], {});
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete("Products", null, {});
  },
};
