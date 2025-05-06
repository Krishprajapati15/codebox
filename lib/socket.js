const Q = require("q");
const _ = require("lodash");
const sockjs = require("sockjs");
const events = require("events");

const logger = require("./utils/logger")("socket");

const services = {};

/**
 * Initialize the socket server.
 * @param {Object} server - The HTTP server instance.
 * @param {Object} config - Configuration object.
 */
const init = (server, config) => {
    const socket = sockjs.createServer({
        log: logger.log.bind(logger),
    });

    socket.on("connection", (conn) => {
        const service = conn.pathname.split("/")[2]; // Extract service name from URL.
        logger.log(`Connection to service '${service}'`);

        // Check if the service exists.
        if (!services[service]) {
            conn.close(404, "Service not found");
            return logger.error(`Invalid service '${service}'`);
        }

        // Attach a helper method to send data.
        conn.do = (method, data) => {
            conn.write(
                JSON.stringify({
                    method,
                    data,
                })
            );
        };

        conn.on("data", (data) => {
            // Parse incoming data.
            try {
                data = JSON.parse(data);
            } catch (e) {
                logger.error("Error parsing data:", data, e.message);
                return conn.do("error", { message: "Invalid JSON format" });
            }

            // Check if the data contains a method.
            if (data.method) {
                conn.emit(`do.${data.method}`, data.data || {});
            } else {
                conn.emit("message", data);
            }
        });

        // Call the service handler.
        services[service].handler(conn);
    });

    // Install socket handlers with a proper regex prefix.
    socket.installHandlers(server, {
        prefix: "/socket/\\w+",
    });
};

/**
 * Add a new service to the socket server.
 * @param {string} name - The name of the service.
 * @param {Function} handler - The handler function for the service.
 */
const addService = (name, handler) => {
    if (
        !name ||
        typeof name !== "string" ||
        !handler ||
        typeof handler !== "function"
    ) {
        throw new Error("Invalid service name or handler function.");
    }
    logger.log("Adding service:", name);

    services[name] = {
        handler,
    };
};

module.exports = {
    init,
    service: addService,
};
