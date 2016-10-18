#Introduction

This folder contains utilities that are useful when constructing DocumentDB server-side stored procedures, triggers and user defined functions.

##Utils


- DocDBWrapperScript.js

	When building server-side logic in Stored Procedures, Triggers, UDFs etc. it is useful to have Visual Studio IntelliSense to help you out. Using the `DocDbWrapperScript.js` wrapper file you can enable full server-side IntelliSense for the server-side JS SDK.  

	Save the `DocDbWrapperScript.js` file into your solution, and then reference it in the JS file you are working on.  Provide the following path to the file explicitly in comments.  You must use a relative path for the IntelliSense to work ([more here](https://msdn.microsoft.com/en-us/library/bb385682.aspx)).
	
	```xml
	<reference path="DocDbWrapperScript.js" />
	```

	This can also be set in Visual Studio for the "Generic" Reference group:

	```
	Tools | Options | Text Editor | JavaScript | IntelliSense | References
	```
