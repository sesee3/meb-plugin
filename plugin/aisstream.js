const apiToken = "08a9a9828f8186c661d0293741fd01971bc2d2f4"

function aisStream() {

    const socket = new WebSocket('wss://stream.aisstream.io/v0/stream');
    socket.onopen = function (_) {
        let subscriptionMessage = {
            Apikey: apiToken,
            BoundingBox: [[[ [38.30, 15.50], [38.10, 15.70] ]]]
        }
        socket.send(JSON.stringify(subscriptionMessage));

        console.log("✅ WebSocket Connected");
    };

    socket.onmessage = function (event) {
        event.data.text().then(text => {
            try {
                const json = JSON.parse(text);
                console.log(json);

            } catch (e) {
                console.error("Invalid JSON:", text);
            }
        });
    };

    socket.onerror = (error) => console.error('WebSocket Error:', error);
    socket.onclose = () => console.log('WebSocket Connection Closed');
}

module.exports = { aisStream };