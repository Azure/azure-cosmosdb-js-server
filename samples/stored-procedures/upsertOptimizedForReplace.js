/**
 * A DocumentDB stored procedure that upserts a given document (insert new or update if present) using its id property.<br/>
 * This implementation queries for the document's id, and creates if absent and replaces if found.
 * Use this sproc if replaces are more common than creates, otherwise use "upsert" 
 *
 * @function
 * @param {Object} document - A document that should be upserted into this collection.
 * @returns {Object.<string>} Returns an object with the property:<br/>
 *   op - created (or) replaced.
 */
function upsertOptimizedForReplace(document) {
    var context = getContext();
    var collection = context.getCollection();
    var collectionLink = collection.getSelfLink();
    var response = context.getResponse();

    // Not checking for existence of document.id for compatibility with createDocument.
    if (!document) throw new Error("The document is undefined or null.");

    retrieveDoc(document, null, callback);

    function retrieveDoc(doc, continuation, callback) {
        var query = { query: "select * from root r where r.id = @id", parameters: [ {name: "@id", value: doc.id}]};
        var requestOptions = { continuation : continuation };
        var isAccepted = collection.queryDocuments(collectionLink, query, requestOptions, function(err, retrievedDocs, responseOptions) {
            if (err) throw err;
            if (retrievedDocs.length > 0) {
                tryReplace(retrievedDocs[0], doc, callback);
            } else if (responseOptions.continuation) {
                // Conservative check for continuation. Not expected to hit in practice for the "id query".
                retrieveDoc(doc, responseOptions.continuation, callback);
            } else {
                tryCreate(doc, callback);
            }
            });
        if (!isAccepted) throw new Error("Unable to query documents");
    }

    function tryCreate(doc, callback) {
        var isAccepted = collection.createDocument(collectionLink, doc, callback);
        if (!isAccepted) throw new Error("Unable to schedule create document");
        response.setBody({"op": "created"});
    }

    function tryReplace(docToReplace, docContent, callback) {
        var isAccepted = collection.replaceDocument(docToReplace._self, docContent, callback);
        if (!isAccepted) throw new Error("Unable to schedule replace document");
        response.setBody({"op": "replaced"});
    }

    function callback(err, doc, options) {
        if (err) throw err;
    }
}
