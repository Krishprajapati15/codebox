const _ = require("lodash");
const logger = require("./utils/logger")("hooks");

let BOXID = null;
let HOOKS = {};
let SECRET_TOKEN = null;

const DEFAULT_TIMEOUT = 5000; // Default timeout for HTTP requests (in milliseconds)

// Post-processing hooks for specific events
const POSTHOOKS = {
    "users.auth": function (data) {
        if (
            !_.has(data, "id") ||
            !_.has(data, "name") ||
            !_.has(data, "token") ||
            !_.isString(data.email)
        ) {
            throw new Error("Invalid authentication data");
        }
        return data;
    },
};

/**
 * Call a hook.
 * @param {string} hook - The name of the hook to call.
 * @param {Object} data - The data to pass to the hook.
 * @returns {Promise<any>} - Resolves with the result of the hook.
 * @throws {Error} - Throws an error if the hook does not exist or fails.
 */
const use = async (hook, data) => {
    logger.log(`Calling hook: '${hook}'`);

    if (!HOOKS[hook]) {
        throw new Error(`Hook '${hook}' does not exist`);
    }

    let result;
    const handler = HOOKS[hook];

    if (_.isFunction(handler)) {
        // Local function hook
        result = await handler(data);
    } else if (_.isString(handler)) {
        // Remote HTTP hook
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);

        try {
            const response = await fetch(handler, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: SECRET_TOKEN,
                },
                body: JSON.stringify({
                    id: BOXID,
                    data,
                    hook,
                }),
                signal: controller.signal,
            });

            clearTimeout(timeout); // Clear the timeout after the request completes

            if (!response.ok) {
                const errBody = await response.text();
                throw new Error(`Error with ${hook} webhook: ${errBody}`);
            }

            result = await response.json();
        } catch (error) {
            clearTimeout(timeout); // Ensure timeout is cleared on error
            logger.error(`Error calling webhook '${hook}':`, error.message);
            throw new Error(`Error with ${hook} webhook: ${error.message}`);
        }
    } else {
        throw new Error(`Invalid hook type for '${hook}'`);
    }

    // Post-processing hook
    if (POSTHOOKS[hook]) {
        try {
            result = POSTHOOKS[hook](result);
        } catch (error) {
            logger.error(
                `Error in post-processing for hook '${hook}':`,
                error.message
            );
            throw new Error(
                `Post-processing error for '${hook}': ${error.message}`
            );
        }
    }

    return result;
};

/**
 * Initialize the hook system.
 * @param {Object} options - Configuration options.
 * @param {string} options.id - The unique ID for the system.
 * @param {Object} options.hooks - An object defining all hooks.
 * @param {string} options.secret - The secret token for authorization.
 * @throws {Error} - Throws an error if the options are invalid.
 */
const init = (options) => {
    logger.log("Initializing hooks");

    if (!_.isObject(options) || !_.isObject(options.hooks)) {
        throw new Error('Invalid options: "hooks" must be an object');
    }

    if (!_.isString(options.id) || !_.isString(options.secret)) {
        throw new Error('Invalid options: "id" and "secret" must be strings');
    }

    BOXID = options.id;
    HOOKS = options.hooks;
    SECRET_TOKEN = options.secret;

    logger.log(`Hooks initialized with ID: '${BOXID}'`);
};

module.exports = {
    init,
    use,
};
