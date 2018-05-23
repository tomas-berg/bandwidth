/** @module error */
'use strict';

/**
 * Base abstract class representing a CBWError.
 * @extends Error
 */
class CBWError extends Error {
    constructor(msg) {
        super(msg);
        this.name = this.constructor.name;
    }
}

/**
 * Class representing a CBWTNSError.
 * @extends CBWError
 */
class CBWTNSError extends CBWError {
    /**
     * Create a BWTNSError.
     * @param {string} msg - The text message.
     */
    constructor(msg) {
        super(msg);
    }
}

module.exports = { CBWTNSError };