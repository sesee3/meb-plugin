function setupRoutes(router, lastCallRef) {
    router.get("/ping", async (req, res) => {
        try {
            const text = lastCallRef.current || "pong";
            res.status(200).json({ message: text });
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
        },
    };
}

module.exports = { setupRoutes, getOpenApiSpec };