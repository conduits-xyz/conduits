This project uses [Vite](https://vitejs.dev/) for development.

## Available Scripts

In the project directory, you can run:

### `npm run dev`

Runs the app in the development mode.
Open [http://localhost:5173](http://localhost:5173) to view it in the browser.

### `npm run build`

Builds the app for production using Vite.

## Learn More

See the [Vite documentation](https://vitejs.dev/guide/) for more information.

## About this project

This project is a visual testing for the various capabilities of the conduits. The conduits can be created with the following access methods enabled:

1. GET
2. POST
3. PATCH
4. PUT
5. DELETE

These resemble the various CRUD operations and follow the same concepts behind. The project demonstrates the capability of the different conduits with varying access method controls performing the respective permitted actions.

## Setting up the right proxy when working in local machine

When working against the local gateway server running in port 5000, you will have to add the conduit URI's used for testing in the `/etc/hosts/` file so that it acts as a proxy. This could be replaced later when we have a hosted solution. Eg: if we use conduit `www.abc.trickle.cc` then we have to have an entry in `/etc/hosts` as

```
127.0.0.1 www.abc.trickle.cc
```
