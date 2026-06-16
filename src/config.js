// API + fichiers statiques servis par notre propre server.js (Express)
// En local  : node server.js (ou npm start) -> http://localhost:10000
// En ligne  : Render sert le front ET l'API depuis la même URL,
//             donc on utilise des chemins relatifs (pas besoin de coller d'URL ici).
export const API_BASE =
    (window.location.hostname === 'localhost' ||
     window.location.hostname === '127.0.0.1')
        ? 'http://localhost:10000'
        : '';
