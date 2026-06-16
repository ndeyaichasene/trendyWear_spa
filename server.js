// server.js
//
// Sert les fichiers du SPA (index.html, /public, /src)
// et expose une API REST (GET/POST/PATCH/DELETE) qui lit et écrit db.json.
//
// En LOCAL  : lit/écrit db.json directement sur le disque (fs)
// En LIGNE  : lit/écrit db.json via l'API GitHub (persistance garantie sur Render)
//
// Variables d'environnement à définir sur Render :
//   GITHUB_TOKEN  : ton Personal Access Token GitHub
//   GITHUB_OWNER  : ndeyaichaseneu
//   GITHUB_REPO   : gestion_shein_deploye
//   GITHUB_FILE   : db.json  (chemin du fichier dans le repo, ex: db.json ou data/db.json)
//
// Lancement local : node server.js  ->  http://localhost:10000

const express = require('express');
const fs      = require('fs');
const path    = require('path');

const app    = express();
const PORT   = process.env.PORT || 10000;
const DB_PATH = path.join(__dirname, 'db.json');

// Détecte si on est en production (Render) ou en local
const EN_LIGNE = !!(process.env.GITHUB_TOKEN);

app.use(express.json({ limit: '20mb' }));

// CORS (utile si Live Server encore utilisé en dev)
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
});

// ─────────────────────────────────────────────────────────────────────────────
// Cache mémoire : évite de rappeler GitHub à chaque requête GET
// ─────────────────────────────────────────────────────────────────────────────
let cacheDB  = null;   // contenu de db.json en mémoire
let cacheSHA = null;   // SHA du fichier sur GitHub (obligatoire pour le PUT)

// ─────────────────────────────────────────────────────────────────────────────
// Fonctions de lecture / écriture (locales ou GitHub selon l'environnement)
// ─────────────────────────────────────────────────────────────────────────────

async function lireDB() {
    if (!EN_LIGNE) {
        // LOCAL : lecture directe sur le disque
        return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
    }

    // EN LIGNE : on renvoie le cache si disponible, sinon on va chercher sur GitHub
    if (cacheDB) return cacheDB;

    const owner = process.env.GITHUB_OWNER;
    const repo  = process.env.GITHUB_REPO;
    const file  = process.env.GITHUB_FILE || 'db.json';
    const token = process.env.GITHUB_TOKEN;

    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${file}`;
    const res = await fetch(url, {
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json'
        }
    });

    if (!res.ok) {
        const err = await res.text();
        throw new Error(`GitHub GET échoué : ${res.status} ${err}`);
    }

    const data = await res.json();
    cacheSHA = data.sha;
    cacheDB  = JSON.parse(Buffer.from(data.content, 'base64').toString('utf-8'));
    return cacheDB;
}

async function ecrireDB(db) {
    if (!EN_LIGNE) {
        // LOCAL : écriture directe sur le disque
        fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
        return;
    }

    // EN LIGNE : mise à jour du fichier sur GitHub via l'API
    const owner = process.env.GITHUB_OWNER;
    const repo  = process.env.GITHUB_REPO;
    const file  = process.env.GITHUB_FILE || 'db.json';
    const token = process.env.GITHUB_TOKEN;

    const contenu = JSON.stringify(db, null, 2);
    const contenuBase64 = Buffer.from(contenu).toString('base64');

    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${file}`;
    const res = await fetch(url, {
        method: 'PUT',
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            message: 'mise à jour db.json',
            content: contenuBase64,
            sha: cacheSHA
        })
    });

    if (!res.ok) {
        const err = await res.text();
        throw new Error(`GitHub PUT échoué : ${res.status} ${err}`);
    }

    const data = await res.json();
    cacheSHA = data.content.sha;  // met à jour le SHA pour la prochaine écriture
    cacheDB  = db;                // met à jour le cache mémoire
}

// Génère un id unique dans la collection
function genererId(liste) {
    let id;
    do {
        id = Math.random().toString(36).slice(2, 11);
    } while (liste.some((item) => String(item.id) === id));
    return id;
}

// ─────────────────────────────────────────────────────────────────────────────
// API REST générique pour chaque collection de db.json
// ─────────────────────────────────────────────────────────────────────────────

const COLLECTIONS = ['utilisateurs', 'produits', 'panier', 'favoris', 'commandes'];

COLLECTIONS.forEach((nom) => {
    const route = `/${nom}`;

    // GET /xxx  →  liste complète, filtrable avec ?champ=valeur
    app.get(route, async (req, res) => {
        try {
            const db = await lireDB();
            let items = db[nom] || [];
            Object.entries(req.query).forEach(([champ, valeur]) => {
                items = items.filter((item) => String(item[champ]) === String(valeur));
            });
            res.json(items);
        } catch (e) {
            console.error(e.message);
            res.status(500).json({ error: e.message });
        }
    });

    // GET /xxx/:id  →  un seul élément
    app.get(`${route}/:id`, async (req, res) => {
        try {
            const db   = await lireDB();
            const item = (db[nom] || []).find((it) => String(it.id) === String(req.params.id));
            if (!item) return res.status(404).json({ error: `${nom} introuvable` });
            res.json(item);
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // POST /xxx  →  création
    app.post(route, async (req, res) => {
        try {
            const db = await lireDB();
            if (!db[nom]) db[nom] = [];
            const nouvelItem = { id: genererId(db[nom]), ...req.body };
            db[nom].push(nouvelItem);
            await ecrireDB(db);
            res.status(201).json(nouvelItem);
        } catch (e) {
            console.error(e.message);
            res.status(500).json({ error: e.message });
        }
    });

    // PATCH /xxx/:id  →  mise à jour partielle
    app.patch(`${route}/:id`, async (req, res) => {
        try {
            const db    = await lireDB();
            const liste = db[nom] || [];
            const index = liste.findIndex((it) => String(it.id) === String(req.params.id));
            if (index === -1) return res.status(404).json({ error: `${nom} introuvable` });
            liste[index] = { ...liste[index], ...req.body, id: liste[index].id };
            await ecrireDB(db);
            res.json(liste[index]);
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // DELETE /xxx/:id  →  suppression
    app.delete(`${route}/:id`, async (req, res) => {
        try {
            const db    = await lireDB();
            const liste = db[nom] || [];
            const index = liste.findIndex((it) => String(it.id) === String(req.params.id));
            if (index === -1) return res.status(404).json({ error: `${nom} introuvable` });
            const [supprime] = liste.splice(index, 1);
            await ecrireDB(db);
            res.json(supprime);
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fichiers statiques du SPA
// ─────────────────────────────────────────────────────────────────────────────

app.use('/public', express.static(path.join(__dirname, 'public')));
app.use('/src',    express.static(path.join(__dirname, 'src')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ─────────────────────────────────────────────────────────────────────────────
// Démarrage
//
// En LOCAL  : on lance un vrai serveur qui écoute sur un port (node server.js)
// Sur VERCEL : Vercel exécute ce fichier comme une fonction serverless,
//              il ne faut donc PAS appeler app.listen() — on exporte juste
//              l'app Express, Vercel s'occupe de la recevoir et d'y router
//              les requêtes (grâce à vercel.json, voir plus bas).
// ─────────────────────────────────────────────────────────────────────────────

if (!process.env.VERCEL) {
    app.listen(PORT, () => {
        const mode = EN_LIGNE ? 'PRODUCTION (GitHub API)' : 'LOCAL (db.json disque)';
        console.log(`Serveur TrendyWear démarré [${mode}] : http://localhost:${PORT}`);
    });
}

module.exports = app;
