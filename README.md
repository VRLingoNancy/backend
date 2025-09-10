# Getting Started with [Fastify-CLI](https://www.npmjs.com/package/fastify-cli)

This project was bootstrapped with Fastify-CLI.

## Available Scripts

In the project directory, you can run:

### `npm run dev`

To start the app in dev mode.\
Open [http://localhost:3000](http://localhost:3000) to view it in the browser.

### `npm start`

For production mode

### `npm run test`

Run the test cases.

## Learn More

To learn Fastify, check out the [Fastify documentation](https://fastify.dev/docs/latest/).

##

Pour utiliser signer et valider les JWT il faut générer des clés dans /config/jwt.
La clé privé peut-être générée avec la commande : openssl genrsa -out private.pem 2048
La clé publique peut-être générée avec la commande : openssl rsa -in private.pem -outform PEM -pubout -out public.pem
