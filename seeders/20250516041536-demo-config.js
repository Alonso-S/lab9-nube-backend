"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.bulkInsert("Configs", [
      {
        key: "S3_BUCKET_URL",
        value: "https://jose-myawsbucket1.s3.us-east-2.amazonaws.com/",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.bulkDelete("Configs", null, {});
  },
};
