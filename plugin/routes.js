function setupRoutes(router, lastCallRef) {
    router.get("/ping", async (req, res) => {
        try {
            const text = lastCallRef.current || "pong";
            res.status(200).sendFile(__dirname + "/steering_support/helm_steering_destra.html");
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // Semplice pagina HTML su /meb/suggestion che mostra "ciao"
    router.get("/meb/suggestion", (req, res) => {
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.send("<!DOCTYPE html><html><head><title>MEB Suggestion</title></head><body><h1>ciao</h1></body></html>");
    });

    router.get("/meb/helm_steering_destro", (req, res) => {
         try {
            res.status(200).sendFile(__dirname + "/steering_support/helm_steering_destro.html");
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
        },
    };
}

module.exports = { setupRoutes, getOpenApiSpec };