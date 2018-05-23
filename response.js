/** @module response */
'use strict';

const xmlJS     = require('xml-js');
const fetch     = require('node-fetch');
const BWError   = require('./error.js');

const v = (param) => { throw new Error(`Class CBWResponse: Not valid param: ${param}`); };
/**
 * Base abstract class representing a CBWResponse.
 */
class CBWResponse {
    constructor(
        text        = v('text'),
        accId       = v('accId'),
        site        = v('site'),
        sippeerId   = v('sippeerId'),
        options     = v('options'),
        headers     = v('headers'),
        baseUrl     = v('baseUrl')) {
        this.text       = text;
        this.accId      = accId;
        this.site       = site;
        this.sippeerId  = sippeerId;
        this.options    = options;
        this.headers    = headers;
        this.baseUrl    = baseUrl;
    }

    set text(text) {
        this.textValue  = text;
        this.json       = null;
    }

    get text() { return this.textValue; }

    /** Convert to JSON obj */
    toJSON() {
        if (!this.text)
            return null;

        if (!this.json)
            this.json = xmlJS.xml2js(this.text, { compact: true });

        return this.json;
    }

    /** Return raw XML */
    toXML() {
        return this.text;
    }

    /** Overloaded */
    toString() {
        return this.text;
    }

    /** Overloaded */
    inspect() {
        return this.text;
    }
}

/**
 * Class representing a CBWTNSResponse.
 * @extends CBWResponse
 * @type {CBWTNSResponse}
 */
class CBWTNSResponse extends CBWResponse {
    /**
     * Create a BWTNSResponse.
     * @param {string} text - The text message as XML doc returned.
     */
    constructor(text, accId, site, sippeerId, options, headers, baseUrl) {
        super(text, accId, site, sippeerId, options, headers, baseUrl);
        this.nextIndex  = 0;
        this.regex      = /<(.+)>/;
    }

    /** Get numbers array */
    get Numbers() {
        if (!this.toJSON())
            return null;

        let result = [];

        if (this.json.SipPeerTelephoneNumbersResponse
            .SipPeerTelephoneNumbers
            .SipPeerTelephoneNumber instanceof Array)
            result = this.json.SipPeerTelephoneNumbersResponse
                .SipPeerTelephoneNumbers
                .SipPeerTelephoneNumber
                .map((item) => item.FullNumber._text);
        else
            result = [ this.json.SipPeerTelephoneNumbersResponse.SipPeerTelephoneNumbers.SipPeerTelephoneNumber.FullNumber._text ];

        return result;
    }

    [Symbol.iterator]() { return this; }

    /**
     * Get next page iterator method
     *
     * @return {CBWTNSResponse} CBWTNSResponse object.
     */
    next() {
        if (!((((this.toJSON() || {}).SipPeerTelephoneNumbersResponse || {}).Links || {}).next || {})._text)
            return { done: true };

        const link = this.regex.exec(this.toJSON().SipPeerTelephoneNumbersResponse.Links.next._text)[1];
        return { value: (async function(_this, link) {
            const res = await fetch(link, { headers: _this.headers });

            if (!res.ok)
                throw new BWError.CBWTNSError(res.statusText);

            _this.text = await res.text();
            _this.nextIndex++;
            return { value: new CBWTNSResponse(_this.text, _this.accId, _this.site, _this.sippeerId, _this.options, _this.headers, _this.baseUrl), done: false };
        })(this, link), done: false };
    }
}

/**
 * Class representing a CBWOrderResponse.
 * @extends CBWResponse
 * @type {CBWOrderResponse}
 */
class CBWOrderResponse extends CBWResponse {
    /**
     * Create a CBWOrderResponse.
     */
    constructor(text, accId, site, sippeerId, options, headers, baseUrl) {
        super(text, accId, site, sippeerId, options, headers, baseUrl);
        this.toJSON();
    }

    get Id() {
        if (!this.json)
            return null;

        return this.json.OrderResponse.Order.id._text;
    }

    get Status() {
        if (!this.json)
            return null;

        return this.json.OrderResponse.OrderStatus._text;
    }
}

/**
 * Class representing a CBWCheckOrderResponse.
 * @extends CBWResponse
 * @type {CBWCheckOrderResponse}
 */
class CBWCheckOrderResponse extends CBWResponse {
    /**
     * Create a CBWCheckOrderResponse.
     */
    constructor(text, accId, site, sippeerId, options, headers, baseUrl) {
        super(text, accId, site, sippeerId, options, headers, baseUrl);
        this.toJSON();
    }

    get Status() {
        if (!this.json)
            return null;

        return this.json.OrderResponse.OrderStatus._text;
    }

    get Numbers() {
        if (!this.json)
            return null;
        
        let result = null;

        if(this.json.OrderResponse.CompletedNumbers.TelephoneNumber instanceof Array)
            result = this.json.OrderResponse.CompletedNumbers.TelephoneNumber
                .map((item) => `+1${item.FullNumber._text}`);
        else
            result = `+1${this.json.OrderResponse.CompletedNumbers.TelephoneNumber.FullNumber._text}`;
        
        return result;
    }
}

/**
 * Class representing a CBWDisconnectOrderResponse.
 * @extends CBWResponse
 * @type {CBWDisconnectOrderResponse}
 */
class CBWDisconnectOrderResponse extends CBWResponse {
    /**
     * Create a CBWDisconnectOrderResponse.
     */
    constructor(text, accId, site, sippeerId, options, headers, baseUrl) {
        super(text, accId, site, sippeerId, options, headers, baseUrl);
        this.toJSON();
    }

    get Status() {
        if (!this.json)
            return null;

        return this.json.DisconnectTelephoneNumberOrderResponse.OrderStatus._text;
    }
}

/**
 * Class representing a UnifiedResponse.
 * @type {UnifiedResponse}
 */
class UnifiedResponse {
    /**
     * Create a UnifiedResponse.
     */
    constructor(obj) {
        this.obj = obj;
    }

    static _parseAreaCode(input) {
        let start = input.indexOf('(');
        let end = input.indexOf(')');
        if (start > -1 && end > -1) {
            return input.substring(start + 1, end);
        }
        return null;
    }

    get Response() {
        let result = {};
        let numbers = this.obj.OrderResponse.CompletedNumbers.TelephoneNumber;
        
        if (!(numbers instanceof Array)) {
            numbers = [{ FullNumber: { _text: numbers.FullNumber._text }}];
        }
        
        result.dids = [];
        numbers.forEach(item => {
            result.dids.push({
                peerId: this.obj.OrderResponse.Order.PeerId._text,
                didId: this.obj.order_id,
                e164: `+1${item.FullNumber._text}`,
                countryCodeA3: 'USA',
                areaCode: UnifiedResponse._parseAreaCode(this.obj.OrderResponse.Summary._text)
            });
        });

        result.resultCount = numbers.length;
        return result;
    }
}

module.exports = {
    CBWTNSResponse,
    CBWOrderResponse,
    CBWCheckOrderResponse,
    CBWDisconnectOrderResponse,
    UnifiedResponse
};
