const fs = require("fs");
const path = require("path");

module.exports = function(app, settings) {
    // Serve mappa
    app.get('/meb/map', (req, res) => {
        const filePath = path.join(__dirname, "public", "map.html");
        fs.readFile(filePath, "utf8", (err, html) => {
            if (err) {
                res.status(500).send("Errore nel caricamento della mappa");
                return;
            }
            const token = settings?.mapboxKey ?? "";
            const finalHtml = html.replace("{{MAPBOX_KEY}}", token);
            res.setHeader("Content-Type", "text/html; charset=utf-8");
            res.send(finalHtml);
        });
    });

    // WebSocket forward: posizione in tempo reale
    let lastPosition = null;

    app.streambundle.getSelfStream("navigation.position").onValue(pos => {
        lastPosition = pos;
    });

    // Endpoint JSON per marker barca (se vuoi usarlo invece del WS SignalK)
    app.get('/meb/map/boat', (req, res) => {
        if (!lastPosition) {
            res.json({ error: "No position data available" });
            return;
        }
        res.json(lastPosition);
    });
}
