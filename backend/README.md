# Conduits backend services

Backend consists of a resource server and a gateway server.

The resource server exposes a REST api to manage _users_ and their
_conduits_. A _conduit_ is an endpoint serviced by a gateway server.

The gateway server provides a **unified** and **normalized** API to the _conduit_.
Requests to the _conduit_ are transformed as necessary and forwarded to
the down stream service provider. The response from the service provider is likewise transformed as necessary.


# Development

## Getting started

Two `.env` files are required to get started. Both of these files should
be present in the backend folder relative to the root of the repository.

---

> Copy `.env-example` as `.env`<br>
> Copy `.env.conduit-user.example` as `.env.conduit-user`

---

1. A global `.env` file containing client credentials for the
   **gateway-server**. For expediency, the gateway is treated as a **_special user_**. In Oauth terminology, the gateway is a confidential client! 

   - `GATEWAY_SERVER_EMAIL`
   - `GATEWAY_SERVER_PASSWORD`

   The above values will be used to authenticate the **_gateway_**
   <br>
   Refer to the `.env-example` for more accurate information
   on what variables are supposed to be in the actual global
   `.env` file.
   <br>
   Notes:

   1. Create and populate this file before starting the
      **crud-server**; otherwise, it will fail to start.
   2. This is a workaround until we have proper user
      management in place.

2. A `.env.conduit-user` that contains credentials related to
   the functioning of the conduit service. This includes
   information about the external service and user details.
   This is required for testing the gateway server.
   ```code
      CONDUIT_SERVICE_TYPE=one of {airtable|googleSheets|email}
      CONDUIT_SERVICE_API_KEY=do not share your secrets
      CONDUIT_SERVICE_OBJECT_KEY=variable portion that identifies the object
   ```
3. Integration tests require bootstrap data created by unit tests. So,
   `npm run test-model` first before testing the REST api. Alternatively
   you can also run `npm run createdb`.

### Running the servers

1. Populate test data by running `test-model`
2. Start the resource server by running `start-resource-server`
3. Start the gateway server by running `start-gateway-server`

## Debugging

Error responses and stack traces can be logged to the console by setting
the `DUMP_ERROR_RESPONSE` and `DUMP_STACK_TRACE` environment variables.
The features can be enabled by prepending the environment variable with
the `npm` task command.

`DUMP_ERROR_RESPONSE=1 DUMP_STACK_TRACE=1 npm run <task-name>`

## Developer Tasks

| task                                           | command line                       |
| :--------------------------------------------- | :--------------------------------- |
| Install dependencies                           | `npm install`                      |
| Run linter                                     | `npm run lint`                     |
| Fix lint errors                                | `npm run lint:fix`                 |
| Run data layer tests                           | `npm run test-model`               |
| Run data layer tests with code coverage        | `npm run test-model-with-coverage` |
| Run REST api tests                             | `npm run test-rest`                |
| Run REST api tests with code coverage          | `npm run test-rest-with-coverage`  |
| Run gateway tests                              | `npm run test-gateway`             |
| Run resource server                            | `npm run start-resource-server`    |
| Run gateway server                             | `npm run start-gateway-server`     |
| Init db with user: admin@praas.com, pwd: praas | `npm run createdb`                 |

## Further reading

- [Data model of resource server](crud-server/README.md)
- [Testing gateway server](gateway-server/README.md)

## Resource server API documentation

Run the script `npm run api-doc`, browser will open resource-server.html page.