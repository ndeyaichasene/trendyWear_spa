const jsonServer = require('json-server');
const server = jsonServer.create();
const router = jsonServer.router('db.json');
const middlewares = jsonServer.defaults();

server.use(middlewares);

// TRÈS IMPORTANT : Permettre à json-server de réécrire les routes pour Vercel
server.use(jsonServer.rewriter({
    '/api/*': '/$1'
}));

server.use(router);

// Vercel gère le port automatiquement via process.env.PORT
const port = process.env.PORT || 3001;
server.listen(port, () => {
    console.log(`JSON Server tourne sur le port ${port}`);
});

module.exports = server;