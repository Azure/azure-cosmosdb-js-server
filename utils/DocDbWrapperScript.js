//---------------------------------------------------------------------------------------------------
// Code should run in strict mode wherever possible.
"use strict";
//---------------------------------------------------------------------------------------------------
// Create tracing object
function Trace(docDbCollectionRawIn) {
    // private member
    var docDbCollectionRaw = docDbCollectionRawIn;


    this.error = function () {
    var message = Array.prototype
                    .slice
                    .apply(arguments)
                    .map(JSON.stringify)
                    .join(' ');
        docDbCollectionRaw.traceFromScript(2, message);
};
//---------------------------------------------------------------------------------------------------       
    this.warning = function () {
    var message = Array.prototype
                    .slice
                    .apply(arguments)
                    .map(JSON.stringify)
                    .join(' ');
        docDbCollectionRaw.traceFromScript(3, message);
};
//---------------------------------------------------------------------------------------------------       
    this.info = function () {
    var message = Array.prototype
                    .slice
                    .apply(arguments)
                    .map(JSON.stringify)
                    .join(' ');
        docDbCollectionRaw.traceFromScript(4, message);
};
}
//---------------------------------------------------------------------------------------------------
var console = new Trace(__docDbCollectionObjectRaw);
//---------------------------------------------------------------------------------------------------
// Create (empty) collection object
var getContext = (function docDbSetupContextObject() {
    var context = {};
    return function () {
        return context;
    };
})();
//---------------------------------------------------------------------------------------------------
(function docDbSetup() {
    // These are from Enum StatusCodeType, Backend\native\common\Transport.h.
    var StatusCodes = {
        // Success
        OK: 200,
        CREATED: 201,
        ACCEPTED: 202,
        NOT_MODIFIED: 304,

        // Client error
        BAD_REQUEST: 400,
        UNAUTHORIZED: 401,
        FORBIDDEN: 403,
        NOT_FOUND: 404,
        REQUEST_TIMEOUT: 408,
        CONFLICT: 409,
        GONE: 410,
        PRECONDITION_FAILED: 412,
        REQUEST_ENTITY_TOO_LARGE: 413,
        TOO_MANY_REQUESTS: 429,
        RETRY_WITH: 449,
        INTERNAL_SERVER_ERROR: 500,
        SERVICE_UNAVAILABLE: 503,
    };
    //---------------------------------------------------------------------------------------------------
    function isNullOrUndefined(x) {
        return x === null || x === undefined;
    }
    //---------------------------------------------------------------------------------------------------
    // Create request and response objects
    (function docDbSetupRequestResponseObjects() {
        var errorMessages = {
            notWritablePrefix: 'Not a writable property: ',
            noNewHeadersPrefix: 'Cannot set new values: ',
            messageSizeTooLarge: 'Cannot set/appendBody because the resulting message would be too large. Return from script with current message and use continuation token to call the script again.'
        };
        var methodNames = {
            // prefixes for accessors for each property
            getPrefix: 'get',
            setPrefix: 'set',
            appendPrefix: 'append',

            // generics for all properties in request/response maps
            getGeneric: 'getValue',
            setGeneric: 'setValue',
            appendGeneric: 'appendValue',

            // request getter
            getRequest: 'getRequest',

            // response getter
            getResponse: 'getResponse',
        };
        //---------------------------------------------------------------------------------------------------
        // This is a map of request/response properties that is created and passed in from 
        // JavaScriptSession.cpp. The keys are property names,
        // and the values are each a pair<propertyValue, isWritable>
        function DocDbMap(docDbPropertyMap) {
            // private vars
            var propertyMap = docDbPropertyMap;

            // tracking chunks for max message size (only doing for strings), if needed;
            var currentMessageSize = propertyMap.maxMessageSize && typeof propertyMap.body === 'string' ?
                propertyMap.body.length : 0;

            // private helpers
            function getValueInternal(propertyName) {
                if (propertyName === undefined) return undefined;

                var pair = propertyMap[propertyName];
                return pair.value;
            }

            function setValueInternal(propertyName, propertyValue) {
                if (propertyName === undefined) return;

                var pair = propertyMap[propertyName];
                if (pair === undefined) {
                    throw new Error(StatusCodes.BAD_REQUEST, errorMessages.noNewHeadersPrefix + propertyName);
                }
                if (!pair.isWritable) {
                    throw new Error(StatusCodes.FORBIDDEN, errorMessages.notWritablePrefix + propertyName);
                }

                currentMessageSize = validateMessageSize(propertyValue, 0);
                pair.value = propertyValue;
            }

            function appendValueInternal(propertyName, propertyValue) {
                if (propertyName === undefined) return;

                var pair = propertyMap[propertyName];
                if (pair === undefined) {
                    throw new Error(StatusCodes.BAD_REQUEST, errorMessages.noNewHeadersPrefix + propertyName);
                }
                if (!pair.isWritable) {
                    throw new Error(StatusCodes.FORBIDDEN, errorMessages.notWritablePrefix + propertyName);
                }

                if (typeof pair.value === 'string') {
                    // Check just the increment portion.
                    currentMessageSize = validateMessageSize(propertyValue, currentMessageSize);
                    pair.value += propertyValue;
                } else {
                    // Check the whole new value.
                    // Simply use '+': string will concatenate, objects use toString, numbers accumulate, etc.
                    var newValue = !isNullOrUndefined(pair.value) ? pair.value + propertyValue : propertyValue;
                    currentMessageSize = validateMessageSize(newValue, 0);
                    pair.value = newValue;
                }
            }

            // If maxMessageSize was specified at initialize, validate that adding more to the message doesn't exceed max.
            function validateMessageSize(value, currentSize) {
                if (!isNullOrUndefined(value) && propertyMap.maxMessageSize) {
                    if (typeof value == 'object') value = JSON.stringify(value);

                    // Use simple approximation: string.length. Ideally we would convert to UTF8 and checked the # of bytes, 
                    // but JavaScript doesn't have built-in support for UTF8 and it would have greater perf impact.
                    currentSize += value.toString().length;
                    if (currentSize > propertyMap.maxMessageSize) {
                        throw new Error(StatusCodes.REQUEST_ENTITY_TOO_LARGE, errorMessages.messageSizeTooLarge);
                    }
                }
                return currentSize;
            }

            // privileged methods
            // helper to create specific privileged methods for each property
            function createSpecificAccessors(propName, isWritable, objToCreateIn) {
                if (isWritable) {
                    objToCreateIn[methodNames.setPrefix + propName] = function (propertyValue) {
                        setValueInternal(propName, propertyValue);
                    }

                    objToCreateIn[methodNames.appendPrefix + propName] = function (propertyValue) {
                        appendValueInternal(propName, propertyValue);
                    }
                }

                objToCreateIn[methodNames.getPrefix + propName] = function () {
                    return getValueInternal(propName);
                }
            }

            // helper to create specific privileged methods for whole map
            function createGenericAccessors(hasWritableProperties, objToCreateIn) {
                if (hasWritableProperties) {
                    objToCreateIn[methodNames.setGeneric] = function (propertyName, propertyValue) {
                        setValueInternal(propertyName, propertyValue);
                    }

                    objToCreateIn[methodNames.appendGeneric] = function (propertyName, propertyValue) {
                        appendValueInternal(propertyName, propertyValue);
                    }
                }

                objToCreateIn[methodNames.getGeneric] = function (propertyName) {
                    return getValueInternal(propertyName);
                }
            }

            // create privileged methods for each property
            var hasWritableProperties = false;
            for (var propName in docDbPropertyMap) {
                var pair = docDbPropertyMap[propName];
                var isWritable = pair.isWritable;

                createSpecificAccessors(propName, isWritable, this);

                if (isWritable) hasWritableProperties = true;
            }

            // generic getters and setters
            createGenericAccessors(hasWritableProperties, this);
        }

        var __context = getContext();

        // create request map
        if (__docDbRequestProperties !== undefined) {
            var request = new DocDbMap(__docDbRequestProperties);
            __context[methodNames.getRequest] = function () {
                return request;
            }
        }

        // create response map
        if (__docDbResponseProperties !== undefined) {
            var response = new DocDbMap(__docDbResponseProperties);
            __context[methodNames.getResponse] = function () {
                return response;
            }
        }
    })();
    // cleanup
    __docDbRequestProperties = undefined;
    __docDbResponseProperties = undefined;
    //---------------------------------------------------------------------------------------------------
    // Add nice interfaces for local store operations
    (function docDbSetupLocalStoreOperations() {
        var errorMessages = {
            invalidCall: 'The function "%s" is not allowed in server side scripting.',
            optionsNotValid: 'The "options" parameter must be of type either "function" or "object". Actual type is: "%s".',
            collLinkNotValid: 'Invalid collection link: "%s".',
            docLinkNotValid: 'Invalid document link: "%s".',
            attLinkNotValid: 'Invalid attachment link: "%s".',
            linkNotInContext: 'Function is not allowed to operate on resources outside current collection. Make sure that the link provided, "%s", belongs to current collection.',
            invalidFunctionCall: 'The function "%s" requires at least %s argument(s) but was called with %s argument(s).',
            invalidParamType: 'The "%s" parameter must be of type %s. Actual type is: "%s".',
        };
        var methodNames = {
            getCollection: 'getCollection',
        };
        var resourceTypes = {
            document: true,
            attachment: false
        };
        //---------------------------------------------------------------------------------------------------       
        //The new Document and Attachment interface in server.
        function DocDbCollection(collectionObjRawIn) {
            // private data member
            var collectionObjRaw = collectionObjRawIn;

            // private methods
            // Like C sprintf, currently only works for %s and %%.
            // Example: sprintf('Hello %s!', 'World!') => 'Hello, World!'
            function sprintf(format) {
                var args = arguments;
                var i = 1;
                return format.replace(/%((%)|s)/g, function (matchStr, subMatch1, subMatch2) {
                    // In case of %% subMatch2 would be '%'.
                    return subMatch2 || args[i++];
                });
            }

            // validation helpers
            function validateCollectionLink(collLink) {
                var collLinkSegments;
                //check link type and formatting
                if (typeof (collLink) !== 'string' || (collLinkSegments = collLink.split('/')).length < 4
                    || collLinkSegments[0].toLowerCase() !== 'dbs' || collLinkSegments[2].toLowerCase() !== 'colls') {
                    throw new Error(StatusCodes.BAD_REQUEST, sprintf(errorMessages.collLinkNotValid, collLink));
                }

                //check if matching the current context
                if (collLink !== collectionObjRaw.getSelfLink()) {
                    throw new Error(StatusCodes.BAD_REQUEST, sprintf(errorMessages.linkNotInContext, collLink));
                }

                return collLinkSegments[3];
            }

            function validateDocumentLink(docLink) {
                var docLinkSegments;
                //check link type and formatting
                if (typeof (docLink) !== 'string' || (docLinkSegments = docLink.split('/')).length < 6
                    || docLinkSegments[0].toLowerCase() !== 'dbs' || docLinkSegments[2].toLowerCase() !== 'colls'
                    || docLinkSegments[4].toLowerCase() !== 'docs') {
                    throw new Error(StatusCodes.BAD_REQUEST, sprintf(errorMessages.docLinkNotValid, docLink));
                }

                //check if current collection link is the parent
                if (docLink.indexOf(collectionObjRaw.getSelfLink()) !== 0) {
                    throw new Error(StatusCodes.BAD_REQUEST, sprintf(errorMessages.linkNotInContext, docLink));
                }

                return { collId: docLinkSegments[3], docId: docLinkSegments[5] };
            }

            function validateAttachmentLink(attLink) {
                var attLinkSegments;
                //check link type and formatting
                if (typeof (attLink) !== 'string' || (attLinkSegments = attLink.split('/')).length < 8
                    || attLinkSegments[0].toLowerCase() !== 'dbs' || attLinkSegments[2].toLowerCase() !== 'colls'
                    || attLinkSegments[4].toLowerCase() !== 'docs' || attLinkSegments[6].toLowerCase() !== 'attachments') {
                    throw new Error(StatusCodes.BAD_REQUEST, sprintf(errorMessages.attLinkNotValid, attLink));
                }

                //check if current collection link is the parent
                if (attLink.indexOf(collectionObjRaw.getSelfLink()) !== 0) {
                    throw new Error(StatusCodes.BAD_REQUEST, sprintf(errorMessages.linkNotInContext, attLink));
                }

                // return a <docId,attId> pair
                return { docId: attLinkSegments[5], attId: attLinkSegments[7] };
            }

            // generate GUID
            
            function getHexaDigit() {
                return Math.floor(Math.random() * 16).toString(16);
            }

            function generateGuidId() {
                var id = "";
		
                for (var i = 0; i < 8; i++) {
                    id += getHexaDigit();
                }
		
                id += "-";
		
                for (var i = 0; i < 4; i++) {
                    id += getHexaDigit();
                }
		
                id += "-";
		
                for (var i = 0; i < 4; i++) {
                    id += getHexaDigit();
                }
		
                id += "-";
		
                for (var i = 0; i < 4; i++) {
                    id += getHexaDigit();
                }
		
                id += "-";
		
                for (var i = 0; i < 12; i++) {
                    id += getHexaDigit();
                }
		
                return id;
            }

            // privileged methods - accessible to user

            /**
            * Get self link of current collection.
            * @name getSelfLink
            * @function
            * @instance
            * @memberof Collection
            * @return {string} Self link of current collection.
            */
            this.getSelfLink = function () {
                return collectionObjRaw.getSelfLink();
            }

            //---------------------------------------------------------------------------------------------------
            // Document interface
            //---------------------------------------------------------------------------------------------------

            /**
            * Read a document.
            * @name readDocument
            * @function
            * @instance
            * @memberof Collection
            * @param {string} documentLink - self link of the document to read
            * @param {ReadOptions} [options] - optional read options
            * @param {RequestCallback} [callback] - <p>optional callback for the operation<br/>If no callback is provided, any error in the operation will be thrown.</p>
            * @return {Boolean} True if the read has been queued, false if it is not queued because of a pending timeout.
            */
            this.readDocument = function (documentLink, options, callback) {
                if (arguments.length === 0) {
                    throw new Error(StatusCodes.BAD_REQUEST, sprintf(errorMessages.invalidFunctionCall, 'readDocument', 1, arguments.length));
                }

                var documentIdPair = validateDocumentLink(documentLink);
                var collectionId = documentIdPair.collId;
                var documentId = documentIdPair.docId;

                if (arguments.length === 1) {
                    options = {};
                } else if (arguments.length === 2 && typeof options === 'function') {
                    callback = options;
                } else if (arguments.length === 2 && typeof options !== 'object') {
                    throw new Error(StatusCodes.BAD_REQUEST, sprintf(errorMessages.optionsNotValid, typeof options));
                }

                var ifNoneMatch = options.ifNoneMatch || '';
                return collectionObjRaw.read(resourceTypes.document, collectionId, documentId, ifNoneMatch, function (err, response) {
                    if (callback) {
                        if (err) {
                            callback(err);
                        } else if (response.options.notModified) {
                            callback(undefined, undefined, response.options);
                        } else {
                            callback(undefined, JSON.parse(response.body), response.options);
                        }
                    } else {
                        if (err) {
                            throw err;
                        }
                    }
                });
            };
            //---------------------------------------------------------------------------------------------
            /**
            * Get all documents for the collection.
            * @name readDocuments
            * @function
            * @instance
            * @memberof Collection
            * @param {string} collectionLink - self link of the collection whose documents are being read
            * @param {FeedOptions} [options] - optional read feed options
            * @param {FeedCallback} [callback] - <p>optional callback for the operation<br/>If no callback is provided, any error in the operation will be thrown.</p>
            * @return {Boolean} True if the read has been queued, false if it is not queued because of a pending timeout.
            */
            this.readDocuments = function readDocuments(collectionLink, options, callback) {
                if (arguments.length === 0) {
                    throw new Error(StatusCodes.BAD_REQUEST, sprintf(errorMessages.invalidFunctionCall, 'readDocuments', 1, arguments.length));
                }

                var collectionId = validateCollectionLink(collectionLink);

                if (arguments.length === 1) {
                    options = {};
                } else if (arguments.length === 2 && typeof options === 'function') {
                    callback = options;
                } else if (arguments.length === 3 && typeof options !== 'object') {
                    throw new Error(StatusCodes.BAD_REQUEST, sprintf(errorMessages.optionsNotValid, typeof options));
                }

                var pageSize = options.pageSize || 100;
                var requestContinuation = options.continuation || '';
                return collectionObjRaw.readFeed(resourceTypes.document, collectionId, requestContinuation, pageSize, function (err, response) {
                    if (callback) {
                        if (err) {
                            callback(err);
                        } else {
                            callback(undefined, JSON.parse(response.body).Documents, response.options);
                        }
                    } else {
                        if (err) {
                            throw err;
                        }
                    }
                });
            };
            //---------------------------------------------------------------------------------------------------
            /**
            * Execute a SQL query on the documents of the collection.
            * @name queryDocuments
            * @function
            * @instance
            * @memberof Collection
            * @param {string} collectionLink - self link of the collection whose documents are being queried
            * @param {string} filterQuery - SQL query string. This can also be a JSON object to pass in a parameterized query along with the values.
            * @param {FeedOptions} [options] - optional read feed options.
            * @param {FeedCallback} [callback] - <p>optional callback for the operation<br/>If no callback is provided, any error in the operation will be thrown.</p>
            * @return {Boolean} True if the query has been queued, false if it is not queued because of a pending timeout.
            */
            this.queryDocuments = function (collectionLink, filterQuery, options, callback) {
                if (arguments.length < 2) {
                    throw new Error(StatusCodes.BAD_REQUEST, sprintf(errorMessages.invalidFunctionCall, 'queryDocuments', 2, arguments.length));
                }

                var collectionId = validateCollectionLink(collectionLink);

                if (typeof filterQuery !== 'string' && typeof filterQuery !== 'object') {
                    throw new Error(StatusCodes.BAD_REQUEST, sprintf(errorMessages.invalidParamType, 'filterQuery', '"string" or "object"', typeof filterQuery));
                }

                if (arguments.length === 2) {
                    options = {};
                } else if (arguments.length === 3 && typeof options === 'function') {
                    callback = options;
                } else if (arguments.length === 3 && typeof options !== 'object') {
                    throw new Error(StatusCodes.BAD_REQUEST, sprintf(errorMessages.optionsNotValid, typeof options));
                }

                var pageSize = options.pageSize || 100;
                var requestContinuation = options.continuation || '';
                var enableScan = options.enableScan === true ? true : false;
                return collectionObjRaw.query(resourceTypes.document, collectionId, filterQuery, requestContinuation, pageSize, enableScan, function (err, response) {
                    if (callback) {
                        if (err) {
                            callback(err);
                        } else {
                            callback(undefined, JSON.parse(response.body).Documents, response.options);
                        }   
                    } else {
                        if (err) {
                            throw err;
                        }
                    }   
                });
            };
            //---------------------------------------------------------------------------------------------------
            /**
            * Create a document under the collection.
            * @name createDocument
            * @function
            * @instance
            * @memberof Collection
            * @param {string} collectionLink - self link of the collection under which the document will be created
            * @param {Object} body - <p>body of the document<br />The "id" property is required and will be generated automatically if not provided (this behaviour can be overriden using the CreateOptions). Any other properties can be added.</p>
            * @param {CreateOptions} [options] - optional create options
            * @param {RequestCallback} [callback] - <p>optional callback for the operation<br/>If no callback is provided, any error in the operation will be thrown.</p>
            * @return {Boolean} True if the create has been queued, false if it is not queued because of a pending timeout.
            */
            this.createDocument = function (collectionLink, body, options, callback) {
                if (arguments.length < 2) {
                    throw new Error(StatusCodes.BAD_REQUEST, sprintf(errorMessages.invalidFunctionCall, 'createDocument', 2, arguments.length));
                }

                var collectionId = validateCollectionLink(collectionLink);

                if (arguments.length === 2) {
                    options = {};
                } else if (arguments.length === 3 && typeof options === 'function') {
                    callback = options;
                } else if (arguments.length === 3 && typeof options !== 'object') {
                    throw new Error(StatusCodes.BAD_REQUEST, sprintf(errorMessages.optionsNotValid, typeof options));
                }

                // Generate random document id if the id is missing in the payload and options.disableAutomaticIdGeneration != true
                if (options.disableAutomaticIdGeneration !== true) {
                    var bodyObject = body;
                    if (typeof body === 'string') {
                        bodyObject = JSON.parse(body);
                    }

                    if (bodyObject.id === undefined || bodyObject.id === "") {
                        bodyObject.id = generateGuidId();
                        body = bodyObject;
                    }
                }

                // stringify if either a) passed in as object b) passed in as string without id
                if (typeof body === 'object') {
                    body = JSON.stringify(body);
                }

                var indexAction = options.indexAction || '';
                return collectionObjRaw.create(resourceTypes.document, collectionId, body, indexAction, function (err, response) {
                    if (callback) {
                        if (err) {
                            callback(err);
                        } else {
                            callback(undefined, JSON.parse(response.body), response.options);
                        }
                    } else {
                        if (err) {
                            throw err;
                        }
                    }
                });
            };
            //---------------------------------------------------------------------------------------------------
            /**
            * Replace a document.
            * @name replaceDocument
            * @function
            * @instance
            * @memberof Collection
            * @param {string} documentLink - self link of the document
            * @param {Object} document - new document body
            * @param {ReplaceOptions} [options] - optional replace options
            * @param {RequestCallback} [callback] - <p>optional callback for the operation<br/>If no callback is provided, any error in the operation will be thrown.</p>
            * @return {Boolean} True if the replace has been queued, false if it is not queued because of a pending timeout.
            */
            this.replaceDocument = function (documentLink, document, options, callback) {
                if (arguments.length < 2) {
                    throw new Error(StatusCodes.BAD_REQUEST, sprintf(errorMessages.invalidFunctionCall, 'replaceDocument', 2, arguments.length));
                }

                var documentIdPair = validateDocumentLink(documentLink);
                var collectionId = documentIdPair.collId;
                var documentId = documentIdPair.docId;

                if (typeof document === 'object') {
                    document = JSON.stringify(document);
                }

                if (arguments.length === 2) {
                    options = {};
                } else if (arguments.length === 3 && typeof options === 'function') {
                    callback = options;
                } else if (arguments.length === 3 && typeof options !== 'object') {
                    throw new Error(StatusCodes.BAD_REQUEST, sprintf(errorMessages.optionsNotValid, typeof options));
                }

                var indexAction = options.indexAction || '';
                var etag = options.etag || '';
                return collectionObjRaw.replace(resourceTypes.document, collectionId, documentId, document, etag, indexAction, function (err, response) {
                    if (callback) {
                        if (err) {
                            callback(err);
                        } else {
                            callback(undefined, JSON.parse(response.body), response.options);
                        }
                    } else {
                        if (err) {
                            throw err;
                        }
                    }
                });
            };
            //---------------------------------------------------------------------------------------------------
            /**
            * Delete a document.
            * @name deleteDocument
            * @function
            * @instance
            * @memberof Collection
            * @param {string} documentLink - self link of the document to delete
            * @param {DeleteOptions} [options] - optional delete options
            * @param {RequestCallback} [callback] - <p>optional callback for the operation<br/>If no callback is provided, any error in the operation will be thrown.</p>
            * @return {Boolean} True if the delete has been queued, false if it is not queued because of a pending timeout.
            */
            this.deleteDocument = function (documentLink, options, callback) {
                if (arguments.length === 0) {
                    throw new Error(StatusCodes.BAD_REQUEST, sprintf(errorMessages.invalidFunctionCall, 'deleteDocument', 1, arguments.length));
                }

                var documentIdPair = validateDocumentLink(documentLink);
                var collectionId = documentIdPair.collId;
                var documentId = documentIdPair.docId;

                if (arguments.length === 1) {
                    options = {};
                } else if (arguments.length === 2 && typeof options === 'function') {
                    callback = options;
                } else if (arguments.length === 2 && typeof options !== 'object') {
                    throw new Error(StatusCodes.BAD_REQUEST, sprintf(errorMessages.optionsNotValid, typeof options));
                }

                var etag = options.etag || '';
                return collectionObjRaw.deleteResource(resourceTypes.document, collectionId, documentId, etag, function (err, response) {
                    if (callback) {
                        if (err) {
                            callback(err);
                        } else {
                            callback(undefined, response.options);
                        }
                    } else {
                        if (err) {
                            throw err;
                        }
                    }
                });
            };
            //---------------------------------------------------------------------------------------------------
            // Attachment interface
            //---------------------------------------------------------------------------------------------------
            /**
            * Read an Attachment.
            * @name readAttachment
            * @function
            * @instance
            * @memberof Collection
            * @param {string} attachmentLink - self link of the attachment to read
            * @param {ReadOptions} [options] - optional read options
            * @param {RequestCallback} [callback] - <p>optional callback for the operation<br/>If no callback is provided, any error in the operation will be thrown.</p>
            * @return {Boolean} True if the read has been queued, false if it is not queued because of a pending timeout.
            */
            this.readAttachment = function (attachmentLink, options, callback) {
                if (arguments.length === 0) {
                    throw new Error(StatusCodes.BAD_REQUEST, sprintf(errorMessages.invalidFunctionCall, 'readAttachment', 1, arguments.length));
                }

                var attachmentIdPair = validateAttachmentLink(attachmentLink);
                var documentId = attachmentIdPair.docId;
                var attachmentId = attachmentIdPair.attId;

                if (arguments.length === 1) {
                    options = {};
                } else if (arguments.length === 2 && typeof options === 'function') {
                    callback = options;
                } else if (arguments.length === 2 && typeof options !== 'object') {
                    throw new Error(StatusCodes.BAD_REQUEST, sprintf(errorMessages.optionsNotValid, typeof options));
                }

                var ifNoneMatch = options.ifNoneMatch || '';
                return collectionObjRaw.read(resourceTypes.attachment, documentId, attachmentId, ifNoneMatch, function (err, response) {
                    if (callback) {
                        if (err) {
                            callback(err);
                        } else if (response.options.notModified) {
                            callback(undefined, undefined, response.options);
                        } else {
                            callback(undefined, JSON.parse(response.body), response.options);
                        }
                    } else {
                        if (err) {
                            throw err;
                        }
                    }
                });
            };
            //---------------------------------------------------------------------------------------------------
            /**
            * Get all attachments for the document.
            * @name readAttachments
            * @function
            * @instance
            * @memberof Collection
            * @param {string} documentLink - self link of the document whose attachments are being read
            * @param {FeedOptions} [options] - optional read feed options
            * @param {FeedCallback} [callback] - <p>optional callback for the operation<br/>If no callback is provided, any error in the operation will be thrown.</p>
            * @return {Boolean} True if the read has been queued, false if it is not queued because of a pending timeout.
            */
            this.readAttachments = function (documentLink, options, callback) {
                if (arguments.length === 0) {
                    throw new Error(StatusCodes.BAD_REQUEST, sprintf(errorMessages.invalidFunctionCall, 'readAttachments', 1, arguments.length));
                }

                var documentIdPair = validateDocumentLink(documentLink);
                var documentId = documentIdPair.docId;

                if (arguments.length === 1) {
                    options = {};
                } else if (arguments.length === 2 && typeof options === 'function') {
                    callback = options;
                } else if (arguments.length === 2 && typeof options !== 'object') {
                    throw new Error(StatusCodes.BAD_REQUEST, sprintf(errorMessages.optionsNotValid, typeof options));
                }

                var pageSize = options.pageSize || 100;
                var requestContinuation = options.continuation || '';
                return collectionObjRaw.readFeed(resourceTypes.attachment, documentId, requestContinuation, pageSize, function (err, response) {
                    if (callback) {
                        if (err) {
                            callback(err);
                        } else {
                            callback(undefined, JSON.parse(response.body).Attachments, response.options);
                        }
                    } else {
                        if (err) {
                            throw err;
                        }
                    }
                });
            };
            //---------------------------------------------------------------------------------------------------
            /**
            * Execute a SQL query on the attachments for the document.
            * @name queryAttachments
            * @function
            * @instance
            * @memberof Collection
            * @param {string} documentLink - self link of the document whose attachments are being queried
            * @param {string} query - SQL query string. This can also be a JSON object to pass in a parameterized query along with the values.
            * @param {FeedOptions} [options] - optional read feed options
            * @param {FeedCallback} [callback] - <p>optional callback for the operation<br/>If no callback is provided, any error in the operation will be thrown.</p>
            * @return {Boolean} True if the query has been queued, false if it is not queued because of a pending timeout.
            */
            this.queryAttachments = function (documentLink, filterQuery, options, callback) {
                if (arguments.length < 2) {
                    throw new Error(StatusCodes.BAD_REQUEST, sprintf(errorMessages.invalidFunctionCall, 'queryAttachments', 2, arguments.length));
                }

                var documentIdPair = validateDocumentLink(documentLink);
                var documentId = documentIdPair.docId;

                if (typeof filterQuery !== 'string' && typeof filterQuery !== 'object') {
                    throw new Error(StatusCodes.BAD_REQUEST, sprintf(errorMessages.invalidParamType, 'filterQuery', '"string" or "object"', typeof filterQuery));
                }

                if (arguments.length === 2) {
                    options = {};
                } else if (arguments.length === 3 && typeof options === 'function') {
                    callback = options;
                } else if (arguments.length === 3 && typeof options !== 'object') {
                    throw new Error(StatusCodes.BAD_REQUEST, sprintf(errorMessages.optionsNotValid, typeof options));
                }

                var pageSize = options.pageSize || 100;
                var requestContinuation = options.continuation || '';
                var enableScan = options.enableScan === true ? true : false;
                return collectionObjRaw.query(resourceTypes.attachment, documentId, filterQuery, requestContinuation, pageSize, enableScan, function (err, response) {
                    if (callback) {
                        if (err) {
                            callback(err);
                        } else {
                            callback(undefined, JSON.parse(response.body).Attachments, response.options);
                        }
                    } else {
                        if (err) {
                            throw err;
                        }
                    }
                });
            };
            //---------------------------------------------------------------------------------------------------
            /** Create an attachment for the document.
            * @name createAttachment
            * @function
            * @instance
            * @memberof Collection
            * @param {string} documentLink - self link of the document under which the attachment will be created
            * @param {Object} body - <p>metadata that defines the attachment media like media, contentType<br />It can include any other properties as part of the metedata.</p>
            * @param {string} body.contentType - MIME contentType of the attachment
            * @param {string} body.media - media link associated with the attachment content
            * @param {CreateOptions} [options] - optional create options
            * @param {RequestCallback} [callback] - <p>optional callback for the operation<br/>If no callback is provided, any error in the operation will be thrown.</p>
            * @return {Boolean} True if the create has been queued, false if it is not queued because of a pending timeout.
            */
            this.createAttachment = function (documentLink, body, options, callback) {
                if (arguments.length < 2) {
                    throw new Error(StatusCodes.BAD_REQUEST, sprintf(errorMessages.invalidFunctionCall, 'createAttachment', 2, arguments.length));
                }

                var documentIdPair = validateDocumentLink(documentLink);
                var documentId = documentIdPair.docId;

                if (typeof body === 'object') {
                    body = JSON.stringify(body);
                }

                if (arguments.length === 2) {
                    options = {};
                } else if (arguments.length === 3 && typeof options === 'function') {
                    callback = options;
                } else if (arguments.length === 3 && typeof options !== 'object') {
                    throw new Error(StatusCodes.BAD_REQUEST, sprintf(errorMessages.optionsNotValid, typeof options));
                }

                var indexAction = options.indexAction || '';
                return collectionObjRaw.create(resourceTypes.attachment, documentId, body, indexAction, function (err, response) {
                    if (callback) {
                        if (err) {
                            callback(err);
                        } else {
                            callback(undefined, JSON.parse(response.body));
                        }
                    } else {
                        if (err) {
                            throw err;
                        }
                    }
                });
            };
            //---------------------------------------------------------------------------------------------------
            /**
            * Replace an attachment.
            * @name replaceAttachment
            * @function
            * @instance
            * @memberof Collection
            * @param {string} attachmentLink - self link of the attachment to be replaced
            * @param {Object} attachment - new attachment body
            * @param {ReplaceOptions} [options] - optional replace options
            * @param {RequestCallback} [callback] - <p>optional callback for the operation<br/>If no callback is provided, any error in the operation will be thrown.</p>
            * @return {Boolean} True if the replace has been queued, false if it is not queued because of a pending timeout.
            */
            this.replaceAttachment = function (attachmentLink, attachment, options, callback) {
                if (arguments.length < 2) {
                    throw new Error(StatusCodes.BAD_REQUEST, sprintf(errorMessages.invalidFunctionCall, 'replaceAttachment', 2, arguments.length));
                }

                var attachmentIdPair = validateAttachmentLink(attachmentLink);
                var documentId = attachmentIdPair.docId;
                var attachmentId = attachmentIdPair.attId;

                if (typeof attachment === 'object') {
                    attachment = JSON.stringify(attachment);
                }

                if (arguments.length === 2) {
                    options = {};
                } else if (arguments.length === 3 && typeof options === 'function') {
                    callback = options;
                } else if (arguments.length === 3 && typeof options !== 'object') {
                    throw new Error(StatusCodes.BAD_REQUEST, sprintf(errorMessages.optionsNotValid, typeof options));
                }

                var indexAction = options.indexAction || '';
                var etag = options.etag || '';
                return collectionObjRaw.replace(resourceTypes.attachment, documentId, attachmentId, attachment, etag, indexAction, function (err, response) {
                    if (callback) {
                        if (err) {
                            callback(err);
                        } else {
                            callback(undefined, JSON.parse(response.body));
                        }
                    } else {
                        if (err) {
                            throw err;
                        }
                    }
                });
            };
            //---------------------------------------------------------------------------------------------------
            /**
            * Delete an attachment.
            * @name deleteAttachment
            * @function
            * @instance
            * @memberof Collection
            * @param {string} attachmentLink - self link of the attachment to be deleted
            * @param {DeleteOptions} [options] - optional delete options.
            * @param {RequestCallback} [callback] - <p>optional callback for the operation<br/>If no callback is provided, any error in the operation will be thrown.</p>
            * @return {Boolean} True if the delete has been queued, false if it is not queued because of a pending timeout.
            */
            this.deleteAttachment = function (attachmentLink, options, callback) {
                if (arguments.length === 0) {
                    throw new Error(StatusCodes.BAD_REQUEST, sprintf(errorMessages.invalidFunctionCall, 'deleteAttachment', 1, arguments.length));
                }

                var attachmentIdPair = validateAttachmentLink(attachmentLink);
                var documentId = attachmentIdPair.docId;
                var attachmentId = attachmentIdPair.attId;

                if (arguments.length === 1) {
                    options = {};
                } else if (arguments.length === 2 && typeof options === 'function') {
                    callback = options;
                } else if (arguments.length === 2 && typeof options !== 'object') {
                    throw new Error(StatusCodes.BAD_REQUEST, sprintf(errorMessages.optionsNotValid, typeof options));
                }

                var etag = options.etag || '';
                return collectionObjRaw.deleteResource(resourceTypes.attachment, documentId, attachmentId, etag, function (err) {
                    if (callback) {
                        if (err) {
                            callback(err);
                        } else {
                            callback(undefined);
                        }
                    } else {
                        if (err) {
                            throw err;
                        }
                    }
                });
            };
            //---------------------------------------------------------------------------------------------------
        } // DocDbCollection.

        var __context = getContext();

        var docDbCollection = new DocDbCollection(__docDbCollectionObjectRaw);
        __context[methodNames.getCollection] = function () {
            return docDbCollection;
        };
    })(); // docDbSetupLocalStoreOperations.

    // cleanup
    __docDbCollectionObjectRaw = undefined;
})(); // docDbSetup.
//---------------------------------------------------------------------------------------------------
//------------------------------------------------- Documentation Types -----------------------------
/**
 * Options associated with a read operation.
 * @typedef {Object} ReadOptions                             -         Options associated with a read operation.
 * @property {string} [ifNoneMatch]                          -         The conditional HTTP method ifNoneMatch value.
 * @memberof Collection
 *
 */

/**
 * Options associated with a create operation.
 * @typedef {Object} CreateOptions                           -         Options associated with a create operation.
 * @property {string} [indexAction]                          -         Specifies indexing directives.
 * @property {string} indexAction.default                    -         use the default indexing policy specified for this collection
 * @property {string} indexAction.include                    -         include this document in the index
 * @property {string} indexAction.exclude                    -         exclude this document from the index
 * @property {string} [disableAutomaticIdGeneration]         -         Disables automatic generation of "id" field of the document to be created (if it is not provided)
 * @memberof Collection
 *
 */

/**
 * Options associated with a replace operation.
 * @typedef {Object} ReplaceOptions                          -         Options associated with a replace operation.
 * @property {string} [indexAction]                          -         Specifies indexing directives.
 * @property {string} indexAction.default                    -         use the default indexing policy specified for this collection
 * @property {string} indexAction.include                    -         include this document in the index
 * @property {string} indexAction.exclude                    -         exclude this document from the index
 * @property {string} [etag]                                 -         <p>The entity tag associated with the resource.<br/>This is matched with the persisted resource before replacement.</p>
 * @memberof Collection
 *
 */

/**
 * Options associated with a delete operation.
 * @typedef {Object} DeleteOptions                           -         Options associated with a delete operation.
 * @property {string} [etag]                                 -         <p>The entity tag associated with the resource.<br/>This is matched with the persisted resource before deletion.</p>
 * @memberof Collection
 *
 */

/**
 * Options associated with a read feed or query operation.
 * @typedef {Object} FeedOptions                             -         Options associated with a read feed or query operation.
 * @property {Number} [pageSize]                             -         <p>Max number of items to be returned in the enumeration operation.<br/>Value is 100 by default</p>
 * @property {string} [continuation]                         -         Opaque token for continuing the enumeration.
 * @property {Boolean} [enableScan]                          -         Allow scan on the queries which couldn't be served as indexing was opted out on the requested paths (only for queryDocuments() and queryAttachments()
 * @memberof Collection
 *
 */

/**
* Callback to execute after completion of a request.
* @callback RequestCallback
* @param {Object} error                                     -         Will contain error information if an error occurs, undefined otherwise.
* @param {int} error.code                                   -         The HTTP response code corresponding to the error.
* @param {string} error.body                                -         A string containing the error information.
* @param {Object} resource                                  -         <p>An object that represents the requested resource (document or attachment).<br/>This is undefined if an error occurs in the operation.</p>
* @param {Object} options                                   -         Information associated with the response to the operation.
* @param {string} options.currentCollectionSizeInMB         -         Comma delimited string containing the collection's current quota metrics (storage, number of stored procedure, triggers and UDFs) after completion of the operation.
* @param {string} options.maxCollectionSizeInMB             -         Comma delimited string containing the collection's maximum quota metrics (storage, number of stored procedure, triggers and UDFs).
* @param {Boolean} [notModified]                            -         Set to true if the requested resource has not been modified compared to the provided ETag in the ifNoneMatch parameter for a read request.
* @param {Object}
* @memberof Collection
*/

/**
* The callback to execute after completion of read feed or query request.
* @callback FeedCallback
* @param {Object} error                                     -         Will contain error information if an error occurs, undefined otherwise.
* @param {int} error.code                                   -         The HTTP response code corresponding to the error.
* @param {string} error.body                                -         A string containing the error information.
* @param {Array} resources                                  -         <p>An array or resources (documents or attachments) that was read.<br/>This is undefined if an error occurs in the operation.</p>
* @param {Object} options                                   -         Information associated with the response to the operation.
* @param {string} options.continuation                      -         Opaque token for continuing the read feed or query.
* @param {string} options.currentCollectionSizeInMB         -         Comma delimited string containing the collection's current quota metrics (storage, number of stored procedure, triggers and UDFs) after completion of the operation.
* @param {string} options.maxCollectionSizeInMB             -         Comma delimited string containing the collection's maximum quota metrics (storage, number of stored procedure, triggers and UDFs).
* @memberof Collection
*/

/**  Gets the context object that can be used for executing operations on DocumentDB storage.
 *   @name getContext
 *   @function
 *   @global
 *   @returns {Context} Object that is used for executing operations on DocumentDB storage inside the JavaScript function.
*/

/**  The Context object provides access to all operations that can be performed on DocumentDB data, as well as access to the request and response objects.
 *   @name Context
 *   @class
*/

/**  <p>The Request object represents the request message that was sent to the server. This includes information about HTTP headers and the body of the HTTP request sent to the server.<br/>
 *   For triggers, the request represents the operation that is executing when the trigger is run. For example, if the trigger is being run ("triggered") on the creation of a document, then<br/>
 *   the request body contains the JSON body of the document to be created. This can be accessed through the request object and (as JSON) can be natively consumed in JavaScript.<br/>
 *   For stored procedures, the request contains information about the request sent to execute the stored procedure.</p>
 *   @name Request
 *   @class
*/

/**  <p>The Response object represents the response message that will be sent from the server in response to the requested operation. This includes information about the HTTP headers and body of the response from the server.<br/>
 *   The Response object is not present in pre-triggers because they are run before the response is generated.<br/>
 *   For post-triggers, the response represents the operation that was executed before the trigger. For example, if the post-trigger is being run ("triggered") after the creation of a document, then<br/>
 *   the response body contains the JSON body of the document that was created. This can be accessed through the response object and (as JSON) can be natively consumed in JavaScript.<br/>
 *   For stored procedures, the response can be manipulated to send output back to the client-side.<br/><br/>
 *   <b>Note</b>: this object not available in pre-triggers</p>
 *   @name Response
 *   @class
*/

/**  <p>Stored procedures and triggers are registered for a particular collection. The Collection object supports create, read, update and delete (CRUD) and query operations on documents and attachments in the current collection.<br/>
 *   All collection operations are completed asynchronously. You can provide a callback to handle the result of the operation, and to perform error handling if necessary.<br/>
 *   Stored procedures and triggers are executed in a time-limited manner. Long-running stored procedures and triggers are defensively timed out and all transactions performed are rolled back.<br/>
 *   We stop queuing collection operations if the stored procedure is close to timing out. You can inspect the boolean return value of all collection operations to see if an operation was not queued and handle this situation gracefully.</p>
 *   @name Collection
 *   @class
*/

/** Gets the request object.
 *   @name getRequest
 *   @function
 *   @instance
 *   @memberof Context
 *   @returns {Request} Object that provides access to the request message that was sent to the server.
*/

/**  <p>Gets the response object.<br/>
 *   <b>Note</b>: this is not available in pre-triggers.</p> 
 *   @name getResponse
 *   @function
 *   @instance
 *   @memberof Context
 *   @returns {Response} Object that provides access to output through the response message to be sent from the server.
*/

/**  Gets the collection object.
 *   @name getCollection
 *   @function
 *   @instance
 *   @memberof Context
 *   @returns {Collection} Object that provides server-side access to DocumentDB database. It supports operations on documents and attachments in the collection.
*/




/** Gets the request body.
 *  @name getBody
 *  @function
 *  @instance
 *  @memberof Request
 *  @returns {string} The request body.
*/

/** <p>Sets the request body.<br>
 *  Note: this can be only used in a pre-trigger to overwrite the existing request body.<br />
 *  The overwritten request body will then be used in the operation associated with this pre-trigger.</p>
 *  @name setBody
 *  @function
 *  @instance
 *  @memberof Request
 *  @param {string} value - the value to set in the request body
*/

/** Gets a specified request header value.
 *  @name getValue
 *  @function
 *  @instance
 *  @memberof Request
 *  @param {string} key - the name of the header to retrieve
 *  @returns {string} The value of the requested header.
*/

/** <p>Sets a specified request header value.<br> 
 *  Note: this method cannot be used to create new headers.</p>
 *  @name setValue
 *  @function
 *  @instance
 *  @memberof Request
 *  @param {string} key    - the name of the header
 *  @param {string} value  - the value of the header
*/

/** Gets the response body.
 *  @name getBody
 *  @function
 *  @instance
 *  @memberof Response
 *  @returns {string} The response body.
*/

/** <p>Sets the response body.<br />
  * Note: This cannot be done in pre-triggers.<br />
  * In post-triggers, the response body is already set with the requested resource and will be overwritten with this call.<br />
  * In stored procedures, this call can be used to set the response message body as output to the calling client.</p>
  * @name setBody
  * @function
  * @instance
  * @memberof Response
  * @param {string} value - the value to set in the response body
*/

/** Gets a specified response header value.
  * @name getValue
  * @function
  * @instance
  * @memberof Response
  * @param {string} key - the name of the header to retrieve
  * @returns {string} The value of the response header.
*/

/** <p>Sets a specified response header value.<br />
  * Note: this method cannot be used to create new headers.</p>
  * @name setValue
  * @function
  * @instance
  * @memberof Response
  * @param {string} key    - the name of the header
  * @param {string} value  - the value of the header
*/

/** <p>Gets a current quota usage for the resource associated with a post-trigger<br />
  * Note: this method is only available in post-triggers</p>
  * @name getResourceQuotaCurrentUsage
  * @function
  * @instance
  * @memberof Response
  * @returns {string} The value of the current quota usage.
*/

/** <p>Gets a maximum quota allowed for the resource associated with a post-trigger<br />
  * Note: this method is only available in post-triggers</p>
  * @name getMaxResourceQuota
  * @function
  * @instance
  * @memberof Response
  * @returns {string} The value of the maximum allowed quota usage.
*/









