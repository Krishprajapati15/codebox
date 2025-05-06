const _ = require("lodash");
const logger = require("./utils/logger")("hooks");

let BOXID = null;
let HOOKS = {};
let SECRET_TOKEN = null;

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

// Call hook
const use = async function (hook, data) {
    logger.log("call hook", hook);

    if (!HOOKS[hook]) {
        throw new Error(`Hook '${hook}' doesn't exist`);
    }

    let result;

    const handler = HOOKS[hook];

    if (_.isFunction(handler)) {
        result = await handler(data);
    } else if (_.isString(handler)) {
        // Remote HTTP hook
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000); // 5 sec timeout

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

            clearTimeout(timeout);

            if (!response.ok) {
                const errBody = await response.text();
                throw new Error(`Error with ${hook} webhook: ${errBody}`);
            }

            result = await response.json();
        } catch (error) {
            logger.error(`Error calling webhook ${hook}:`, error.message);
            throw new Error(`Error with ${hook} webhook: ${error.message}`);
        }
    } else {
        throw new Error("Not a valid hook type");
    }

    // Post-processing hook
    if (POSTHOOKS[hook]) {
        result = POSTHOOKS[hook](result);
    }

    return result;
};

// Init hook system
const init = function (options) {
    logger.log("init hooks");

    if (!_.isObject(options) || !_.isObject(options.hooks)) {
        throw new Error('Invalid options: "hooks" must be an object');
    }

    if (!_.isString(options.id) || !_.isString(options.secret)) {
        throw new Error('Invalid options: "id" and "secret" must be strings');
    }

    BOXID = options.id;
    HOOKS = options.hooks;
    SECRET_TOKEN = options.secret;
};

module.exports = {
    init,
    use,
};
