/**
 * A stored procedure for Azure DocumentDB which deletes documents with a specified filter key and value
 * @function
 * @param {String} [filterKey]            A key to filter documents on. Only documents with the specified key are deleted. If no key is provided, all documents are deleted. If you would like to also specify a value for this key, pass the filterValue parameter as well. The filterKey parameter must be pesent if the filterValue is present.
 * @param {Any} [filterValue]           If provided, the value that the filterKey must have in order for the document to be deleted. If no filterValue is provided, all documents with the specified filterKey are deleted.
 * @return {responseBody}
 */
function bulkDelete(filterKey, filterValue) {

  if (filterValue && !filterKey) {
    throw new Error('If the "filterValue" parameter is provided, the "filterKey" parameter must be provided as well.');
  }

  const response = __.response; // get the response object

  /**
   * The response body returned by the stored procedure
   * @const
   * @typedef {Object} responseBody
   * @type {Object} responseBody
   * @prop {Number} deleted        The number of documents which were deleted.
   * @prop {Boolean} continuation  Whether there are still more documents to delete.
   */
  const responseBody = {
    deleted: 0,
    continuation: true,
  };

  /**
   * Recursively deletes each document in an array, and then attempts to get more to delete
   * @function
   * @param  {Array} docs  The array of documents to delete
   */
  function deleteDocuments(docs) {
    if (docs.length > 0) {

      // attempt to delete the first document in the array
      const accepted = __.deleteDocument(docs[0]._self, function handler(err) {
        if (err) throw err;

        responseBody.deleted++;   // increment deleted counter
        docs.shift();         // remove document from array
        deleteDocuments(docs); // delete the next doc

      });

      // if the delete request was not accepted due to timeout, return the {@link responseBody} with a continuation
      if (!accepted) response.setBody(responseBody);

    } else {

      // if there are no more documents to delete, try getting more
      getDocuments();

    }
  }

  /**
   * Filters for documents based on the provided filter key and value ({@link filterOn}, {@link filterValue}), and immediately begins deleting them as results are returned
   * @function
   * @param {String} [continuationToken]   A continuation token, if one was received from a previous request
   */
  function getDocuments(continuationToken) {

    /**
     * Handler for the filter request
     * @function
     * @param  {Object} err                 The error object, if any was thrown
     * @param  {Number} err.number          The error code
     * @param  {String} err.body            The body of the error message
     * @param  {Array} docs                 The retrieved documents
     * @param  {Object} info                Info about the request, including a continuation token
     * @param  {String} info.continuation   The continuation token, if any was passed
     * @return {responseBody}
     */
    const filterHandler = function filterHandler(err, docs, info) {
      if (err) throw err;

      if (docs.length > 0) {

        // if documents were found, begin deleting them immediately (prioritizes deletion over searching)
        deleteDocuments(docs);

      } else if (info.continuation) {

        // if the filter came back empty but with a continuation token, get the next set of results
        getDocuments(info.continuation);

      } else {

        // if there are no more documents and no continuation token, return the {@link responseBody} without a continuation
        responseBody.continuation = false;
        response.setBody(responseBody);

      }

    };

    // filter the collection for documents using a filter function
    // NB: The filter function must be inlined in order to take advantage of index
    // (otherwise it will be a full scan).
    const accepted = __.filter(function filter(doc) {

      if (filterValue) {
        return doc[filterKey] === filterValue;
      }

      return doc.hasOwnProperty(filterKey);

    }, { continuation: continuationToken }, filterHandler);

    // if the filter request is not accepted due to timeout, return the response with a continuation
    if (!accepted) response.setBody(responseBody);

  }

  getDocuments(); // start the stored procedure

}
