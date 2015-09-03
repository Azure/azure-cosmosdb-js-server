/**
 * This script is meant to run as a pre-trigger to enforce the uniqueness of the "name" property.
 */

function validateName() {
  var collection = getContext().getCollection();
  var request = getContext().getRequest();
  var docToCreate = request.getBody();

  // Reject documents that do not have a name property by throwing an exception.
  if (!docToCreate.name) {
    throw new Error('Document must include a "name" property.');
  }

  lookForDuplicates();

  function lookForDuplicates(continuation) {
    var query = {
      query: 'SELECT * FROM myCollection c WHERE c.name = @name',
      parameters: [{
        name: '@name',
        value: docToCreate.name
      }]
    };
    var requestOptions = {
      continuation: continuation
    };

    var isAccepted = collection.queryDocuments(collection.getSelfLink(), query, requestOptions,
      function(err, results, responseOptions) {
        if (err) {
          throw new Error('Error querying for documents with duplicate names: ' + err.message);
        }
        if (results.length > 0) {
          // At least one document with name exists.
          throw new Error('Document with the name, ' + docToCreate.name + ', already exists: ' + JSON.stringify(results[0]));
        } else if (responseOptions.continuation) {
          // Else if the query came back empty, but with a continuation token; repeat the query w/ the token.
          // This is highly unlikely; but is included to serve as an example for larger queries.
          lookForDuplicates(responseOptions.continuation);
        } else {
          // Success, no duplicates found! Do nothing.
        }
      }
    );

    // If we hit execution bounds - throw an exception.
    // This is highly unlikely; but is included to serve as an example for more complex operations.
    if (!isAccepted) {
      throw new Error('Timeout querying for document with duplicate name.');
    }
  }
}
