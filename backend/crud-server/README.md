# Conduits Resource Server
REST API server to manage *users* and *conduits* resources. 

## Data Model
Consists of the three entities: System, User, Conduit. These entities are
currently not normalized and subject to breaking design changes.

## System Table
System stores all configuration related settings and their values.
For now storing the config is stored in a js file for convenience. At some
point we may move this information into a database.

## User Table
User stores details of registered users. Users can have zero or more conduits.

### Fields
|  name     | description          | constraints       |
|:----------|:---------------------|:------------------|
| firstName |First name of the user| not null          |
| lastName  |Last name of the user | not null          |
| email     |Email of the user     | not null, unique  |
| hash      |Password of the user  | not null          |
| salt      |Random hex value      | not null          |

## Conduit Table
Conduit stores data related to a non-traditional-storage service endpoint.

### Fields
|  name           | description                                   | constraints                    |
|:----------------|:----------------------------------------------|:-------------------------------|
| suriType        |The type of conduit                            |not null                        |
| suriObjectKey   |Key to locate an object at the NTS provider    |not null                        |
| curi            |System generated conduit URI                   |not null, unique                |
| allowlist       |Allowed ip list                                |not null                        |
| racm            |Request Access Control Map |not null           |not null                        |
| throttle        |Limit requests to 5/sec to avoid DOS attack    |not null, defaults to 'true'    |
| status          |active/inactive                                |not null, defaults to 'inactive'|
| description     |Notes about the conduit                        |null                            |
| hiddenFormField |To avoid bot spamming or manage campaigns      |null                            |

#### suriType
Enum: plan is to support AirTable, Google Sheets, MS Excel.

#### allowlist
JSON: containing an array of objects with the following properties:

| Property  | Description            | constraint |
|:----------|:-----------------------|:-----------|
| ip        | ip address             | required   |
| comment   | comment                | optional   |
| status    | `active` or `inactive` | required   |

#### racm
JSON: containing an array of allowed HTTP methods. The accepted 
methods are:  GET, PUT, POST, PATCH, DELETE. 

At least one method must be present in this array. The default value for
this field is set to `['GET']` if this field is not present in the request.

TBD: add reference to the conduits API here.

#### hiddenFormField
JSON blob: containing an array of objects with the following properties:

| Property  | Description                                                      |
|:----------|:-----------------------------------------------------------------|
| fieldName | name of the field                                                |
| policy    | `drop-if-filled` or `pass-if-match`                              |
| include   | boolean indicating if the field should be sent to target         |
| value     | Value to be matched against the field in case of `pass-if-match` |

# References
## PUT vs PATCH
- https://rapidapi.com/blog/put-vs-patch/
- https://stackoverflow.com/questions/24241893/should-i-use-patch-or-put-in-my-rest-api

```
The PATCH method is the correct choice here as you're updating an existing
resource - the group ID. PUT should only be used if you're replacing a 
resource in its entirety.

Further information on partial resource modification is available in RFC 5789.
Specifically, the PUT method is described as follows:

Several applications extending the Hypertext Transfer Protocol (HTTP) require
a feature to do partial resource modification. The existing HTTP PUT method
only allows a complete replacement of a document. This proposal adds a new
HTTP method, PATCH, to modify an existing HTTP resource.

--Luke Peterson
```

## *Yup Howto:*

- https://stackoverflow.com/questions/63534689/how-to-validate-individual-element-of-an-array-of-json-objects-using-yup

- https://stackoverflow.com/questions/53384140/how-to-condense-yup-when-validations

- https://codesandbox.io/s/xk4r7nq9z?file=/validation-shapes.js

- https://medium.com/weekly-webtips/validate-a-form-yup-i-can-do-that-ad08620689c9

- [Yup array validation for each field in an array](https://github.com/jquense/yup/issues/952)

- https://stackoverflow.com/questions/63649830/yup-create-and-modify-a-validation-schema-at-runtime

- https://dev.to/joaohencke/validating-schema-with-yup-2iii

- [validating two fields that depend on each other](https://dev.to/gabrielterriaga/how-to-validate-two-fields-that-depend-on-each-other-with-yup-1ccg)
- [validation with yup](https://www.techzaion.com/validation-with-yup)
- [get value of another field for validation](https://stackoverflow.com/questions/63058945/get-the-value-of-another-field-for-validation-in-yup-schema)

### NOTES
- we use yup only for body validation
- for query parameters, we use inline code to validate for now
- this is mostly because we don't yet know what we should default
  to and when to return an error