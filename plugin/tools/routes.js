function setupRoutes(router, lastCallRef, app) {
    router.get("/ping", async (req, res) => {
        try {
            const text = lastCallRef.current || "pong";
            res.status(200).sendFile(__dirname + "/steering_support/helm_steering_destra.html");
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    router.get("/helm_steering_destro", (req, res) => {
        try {
            res.status(200).sendFile(__dirname + "/steering_support/helm_steering_destro.html");
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    router.get("/tools", (req, res) => {
        try {
            const path = require("path");
            const filePath = path.join(__dirname, "..", "public", "decrypt_tool.html");
            res.status(200).sendFile(filePath);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // LOGS DATASETS
    router.post("/dataset/start", (req, res) => {
        try {
            if (!app.datasetControl) {
                return res.status(503).json({ error: "Dataset control non disponibile" });
            }
            const result = app.datasetControl.start();
            res.json({ success: result, message: result ? "Registrazione avviata" : "Registrazione già in corso" });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    router.post("/dataset/stop", (req, res) => {
        try {
            if (!app.datasetControl) {
                return res.status(503).json({ error: "Dataset control non disponibile" });
            }
            const result = app.datasetControl.stop();
            res.json({ success: result, message: result ? "Registrazione fermata" : "Nessuna registrazione in corso" });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    router.post("/dataset/restart", (req, res) => {
        try {
            if (!app.datasetControl) {
                return res.status(503).json({ error: "Dataset control non disponibile" });
            }
            const result = app.datasetControl.restart();
            res.json({ success: result, message: "Registrazione riavviata" });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    router.get("/dataset/status", (req, res) => {
        try {
            if (!app.datasetControl) {
                return res.status(503).json({ error: "Dataset control non disponibile" });
            }
            const status = app.datasetControl.getStatus();
            res.json(status);
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    router.get("/dataset/files", (req, res) => {
        try {
            const fs = require('fs');
            const path = require('path');
            const logsDirectory = path.join(__dirname, '..', 'datasetModels', 'saved_datas');
            
            if (!fs.existsSync(logsDirectory)) {
                return res.json({ files: [], count: 0 });
            }
            
            const items = fs.readdirSync(logsDirectory);
            const files = items
                .filter(item => {
                    const fullPath = path.join(logsDirectory, item);
                    return fs.statSync(fullPath).isFile();
                })
                .map(file => {
                    const fullPath = path.join(logsDirectory, file);
                    const stats = fs.statSync(fullPath);
                    return {
                        name: file,
                        size: stats.size,
                        created: stats.birthtime,
                        modified: stats.mtime
                    };
                })
                .sort((a, b) => b.modified.getTime() - a.modified.getTime());
            
            res.json({ files, count: files.length });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

}

function getOpenApiSpec() {
    return {
        openapi: "3.0.0",
        info: { title: "MebWeather API Portal", version: "1.0.0" },
        servers: [{ url: "/plugins/meb-weather" }],
        paths: {
            "/ping": {
                get: {
                    summary: "Called /ping route",
                    responses: {
                        200: {
                            description: "OK",
                            content: {
                                "application/json": {
                                    schema: {
                                        type: "object",
                                        properties: { message: { type: "string" } },
                                    },
                                },
                            },
                        },
                    },
                },
            },
            "/meb/suggestion": {
                get: {
                    summary: "Pagina di test MEB Suggestion",
                    responses: {
                        200: {
                            description: "OK",
                            content: {
                                "text/html": {
                                    schema: { type: "string" },
                                },
                            },
                        },
                    },
                },
            },
            "/dataset/start": {
                post: {
                    summary: "Avvia la registrazione dataset",
                    responses: {
                        200: {
                            description: "Registrazione avviata",
                            content: {
                                "application/json": {
                                    schema: {
                                        type: "object",
                                        properties: {
                                            success: { type: "boolean" },
                                            message: { type: "string" }
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
            "/dataset/stop": {
                post: {
                    summary: "Ferma la registrazione dataset",
                    responses: {
                        200: {
                            description: "Registrazione fermata",
                            content: {
                                "application/json": {
                                    schema: {
                                        type: "object",
                                        properties: {
                                            success: { type: "boolean" },
                                            message: { type: "string" }
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
            "/dataset/restart": {
                post: {
                    summary: "Riavvia la registrazione dataset",
                    responses: {
                        200: {
                            description: "Registrazione riavviata",
                            content: {
                                "application/json": {
                                    schema: {
                                        type: "object",
                                        properties: {
                                            success: { type: "boolean" },
                                            message: { type: "string" }
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
            "/dataset/status": {
                get: {
                    summary: "Ottieni lo stato della registrazione dataset",
                    responses: {
                        200: {
                            description: "Stato corrente",
                            content: {
                                "application/json": {
                                    schema: {
                                        type: "object",
                                        properties: {
                                            isRecording: { type: "boolean" },
                                            recordCount: { type: "number" }
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
            "/dataset/files": {
                get: {
                    summary: "Ottieni la lista dei file log salvati",
                    responses: {
                        200: {
                            description: "Lista file log",
                            content: {
                                "application/json": {
                                    schema: {
                                        type: "object",
                                        properties: {
                                            files: {
                                                type: "array",
                                                items: {
                                                    type: "object",
                                                    properties: {
                                                        name: { type: "string" },
                                                        size: { type: "number" },
                                                        created: { type: "string" },
                                                        modified: { type: "string" }
                                                    }
                                                }
                                            },
                                            count: { type: "number" }
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        },
    };
}

module.exports = { setupRoutes, getOpenApiSpec };