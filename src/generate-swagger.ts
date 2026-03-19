import swaggerAutogen from 'swagger-autogen';
import { config } from 'dotenv';
config();

const doc = {
  info: {
    title: 'WitnessLedger API',
    description: 'WitnessLedger API documentation',
    version: '1.0.0'
  },
  servers: [
    {
      url: process.env.API_URL || 'http://localhost:5000',
      description: 'API Server'
    }
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT'
      }
    }
  },
  security: [
    {
      bearerAuth: []
    }
  ]
};

const outputFile = './swagger-output.json';
const routes = ['./src/app.ts'];

swaggerAutogen({ openapi: '3.0.0' })(outputFile, routes, doc).then(() => {
  console.log('Swagger documentation generated successfully.');
});
