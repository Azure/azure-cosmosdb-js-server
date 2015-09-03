/**
* This script runs as a pre-trigger when a document is inserted:
* for each inserted document, validate/canonicalize document.weekday and create field document.createdTime.
*/
function validateClass() {
    var collection = getContext().getCollection();
    var collectionLink = collection.getSelfLink();
    var doc = getContext().getRequest().getBody();

    // Validate/canonicalize the data.
    doc.weekday = canonicalizeWeekDay(doc.weekday);

    // Insert auto-created field 'createdTime'.
    doc.createdTime = new Date();

    // Update the request -- this is what is going to be inserted.
    getContext().getRequest().setBody(doc);

    function canonicalizeWeekDay(day) {
        // Simple input validation.
        if (!day || !day.length || day.length < 3) throw new Error("Bad input: " + day);

        // Try to see if we can canonicalize the day.
        var days = ["Monday", "Tuesday", "Wednesday", "Friday", "Saturday", "Sunday"];
        var fullDay;
        days.forEach(function (x) {
            if (day.substring(0, 3).toLowerCase() == x.substring(0, 3).toLowerCase()) fullDay = x;
        });
        if (fullDay) return fullDay;

        // Couldn't get the weekday from input. Throw.
        throw new Error("Bad weekday: " + day);
    }
}

