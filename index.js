/** @module bandwidth */
'use strict';

const fetch       = require('node-fetch');
const BWResponse  = require('./response.js');
const BWError     = require('./error.js');
const xmlJS       = require('xml-js');

const v       = (param) => { throw new Error(`Class CBandwidth: Not valid param: ${param}`); };

/**
 * Class representing a CBandwidth.
 */
class CBandwidth {
    /**
     * Create a Bandwidth object.
     *
     * @param {string} login  - BW login account.
     * @param {string} pass   - BW password account.
     * @param {string} accId  - BW account ID.
     * @param {string} site   - BW sites param.
     * @param {Object} [opts] - Options.
     * @param {string} [opts.pageSize=100] - Size of page to request data.
     */
    constructor(
        login   = v('login'),
        pass    = v('password'),
        accId   = v('accountId'),
        site    = v('site-id'),
        opts    = { pageSize: 100 },
        sippeerId
    ) {
        
        this.headers = {
            Authorization:  'Basic ' + (new Buffer(login + ':' + pass).toString('base64')),
            'Content-Type': 'application/xml',
        };

        this.site     = site;
        this.accId    = accId;
        this.options  = opts;
        this.sippeerId = sippeerId;
        this.baseUrl  = 'https://dashboard.bandwidth.com/api';
    }

    /**
     * Get BaseURL of Bandwidth API
     *
     * @static
     * @return {string} base URL
     */
    static get baseUrl() { return this.baseUrl; }

    /**
     * Get SIP Peers telephone numbers by location (sippeer id)
     *
     * @async
     * @method getSipPeersTNS
     * @param {string} sippperId - The SIP Peer location.
     * @return {CBWTNSResponse} CBWTNSResponse object.
     */
    async getSipPeersTNS(sippeerId = v('sippeer-id')) {
        const res = await fetch(`${this.baseUrl}/accounts/${this.accId}/sites/${this.site}/sippeers/${sippeerId}/tns?page=1&size=${this.options.pageSize}`,
            { headers: this.headers });

        if (!res.ok)
            throw new BWError.CBWTNSError(res.statusText);

        return new BWResponse.CBWTNSResponse(
            await res.text(),
            this.accId,
            this.site,
            sippeerId,
            this.options,
            this.headers,
            this.baseUrl
        );
    }

    /**
     * Get SIP Peers telephone numbers by location (sippeer id). Grab all records
     *
     * @async
     * @method getSipPeersTNSAll
     * @param {string} sippperId - The SIP Peer location.
     * @return {Array} Array of numbers
     */
    async getSipPeersTNSAll(sippeerId = v('sippeer-id')) {
        const resObject = await this.getSipPeersTNS(sippeerId);
        let result = resObject.Numbers;

        for (const item of resObject) {
            const res = await item;
            result.push(...res.value.Numbers);
        }

        return result;
    }

    /**
     * Search and order DIDs with AreaCode and Qauntity OR City, State, Quantity
     *
     * @async
     * @method allocate
     * @param {Object} q - query params
     * @param {string} sippperId - The SIP Peer location.
     * @return {CBWOrderResponse}
     */
    async searchAndOrderDID(q = {}) {
        q.quantity = (!q.quantity || isNaN(q.quantity)) ? 1 : q.quantity;

        let obj = null;

        if(q.areaCode) {
            obj = {
                'Order': {
                    'SiteId': this.site,
                    'PeerId': this.sippeerId,
                    'AreaCodeSearchAndOrderType': { 'AreaCode': q.areaCode, 'Quantity': q.quantity }
                }
            };
        }

        if(q.city && q.state) {
            obj = {
                'Order': {
                    'SiteId': this.site,
                    'PeerId': this.sippeerId,
                    'CitySearchAndOrderType': { 'City': q.city, 'State': q.state, 'Quantity': q.quantity }
                }
            };
        }

        if(!obj)
            throw new Error('Not enough parameters');

        let body = xmlJS.js2xml(obj, { compact: true });
        const res = await fetch(`${this.baseUrl}/accounts/${this.accId}/orders`,
            {
                headers: this.headers,
                method: 'POST',
                body: body
            });

        if (!res.ok)
            throw new Error(res.statusText);

        return new BWResponse.CBWOrderResponse(
            await res.text(),
            this.accId,
            this.site,
            this.sippeerId,
            this.options,
            this.headers,
            this.baseUrl
        );
    }

    /**
     * Check order status by OrderId
     *
     * @async
     * @method checkOrder
     * @param {string} orderid - OrderId
     * @param {string} sippperId - The SIP Peer location.
     * @return {CBWCheckOrderResponse}
     */
    async checkOrder(orderid = v('orderid')) {
        const res = await fetch(`${this.baseUrl}/accounts/${this.accId}/orders/${orderid}?tndetail=true`,
            { headers: this.headers });

        if (!res.ok)
            throw new Error(res.statusText);

        return new BWResponse.CBWCheckOrderResponse(
            await res.text(),
            this.accId,
            this.site,
            this.sippeerId,
            this.options,
            this.headers,
            this.baseUrl
        );
    }

    /**
     * Allocate DIDs wrapper
     *
     * @async
     * @method allocate
     * @param {Object} q - query params
     * @param {string} sippperId - The SIP Peer location.
     * @return {UnifiedResponse}
     */
    async allocate(q = {}) {
        let order = await this.searchAndOrderDID(q, this.sippeerId);
        
        // Wait for order to proceed
        let timeout = 1000;

        let result = await new Promise((resolve, reject) => {
            setTimeout(async () => {
                if (order.Status && order.Status == 'RECEIVED') {
                    let check = await this.checkOrder(order.Id, this.sippeerId);
                    if (check.Status == 'COMPLETE') {
                        let obj = check.toJSON();
                        obj.order_id = order.Id;
                        resolve(new BWResponse.UnifiedResponse(obj));
                    }
                    reject(check.Status);
                }
            }, timeout);
        }).catch((err) => { return err; });

        return result.Response;
    }

    /**
     * Disconnect array of DIDs
     *
     * @async
     * @method disconnect
     * @param {string} orderid - OrderId
     * @param {Array} numbers - Array of numbers to disconnect
     * @param {string} sippperId - The SIP Peer location.
     * @return {CBWDisconnectOrderResponse}
     */
    async disconnect(orderid = v('orderid'), numbers = v('numbers')) {
        if(!(numbers instanceof Array))
            throw new Error('Empty numbers array');

        numbers.map((item) => new Object({'_text': item}));

        let obj = { 'DisconnectTelephoneNumberOrder': {
            'CustomerOrderId': orderid,
            'DisconnectTelephoneNumberOrderType': {
                'TelephoneNumberList': {'TelephoneNumber': numbers }}}};

        let body = xmlJS.js2xml(obj, { compact: true });
        const res = await fetch(`${this.baseUrl}/accounts/${this.accId}/disconnects`,
            {
                headers: this.headers,
                method: 'POST',
                body: body
            });

        if (!res.ok)
            throw new Error(res.statusText);

        return new BWResponse.CBWDisconnectOrderResponse(
            await res.text(),
            this.accId,
            this.site,
            this.sippeerId,
            this.options,
            this.headers,
            this.baseUrl
        );
    }
}

module.exports = CBandwidth;
