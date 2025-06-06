# Conduits.App

Dashboard web app for users and administrators of `conduits.xyz` service to manage
conduits and user profile

## Features
TBD...

## Development

> If using [Yarn](https://yarnpkg.com/), `yarn` can replace all occurences
> of `npm` in the command line below. :ok_hand:
> If you don't have node.js, install [nvm](https://github.com/nvm-sh/nvm), is a version manager for [node.js](https://nodejs.org/en/).

### Tasks

| task       | command line       | notes |
| :--------- | :----------------- | :---- |
| install    | `npm install`      | installs dependencies |
| lint       | `npm run lint`     | run eslint on `src` folder |
| lint:fix   | `npm run lint:fix` | run eslint on `src` folder |
| dev        | `npm run dev`      | run the development server |
| build      | `npm run build`    | create production build |
| start      | `npm run start`    | serve the built files |
| test       | `npm run test`     | run tests and report coverage |
| test:watch | `npm run test`     | run tests in watch mode without coverage |


### Vite

This project uses [Vite](https://vitejs.dev/) to run a development server with `npm run dev` and to build the app with `npm run build`.

Note : Since the project uses [husky] to set up pre-commit hooks;
sometimes it can get in the way of development when commiting assets
that are still work in progress. If the code commited do not break any
live features, husky may be bypassed by using the `--no-verify` flag
along with `git commit`.

[husky]: https://github.com/typicode/husky

## Code organization

We want an organization that allows us the ability to get to where we need to.
To that end, we have the following structure at the top level.

```console
dashboard
├── build          //<- generated and bundled files ready for deployment
├── LICENSE        //<- pick one of ISC, MIT or BSD for open source projects
├── package.json   //<- metadata relevant to the project
├── README.md      //<- high level overview and getting started instructions
└── src            //<- 'code' including configuration goes here
```

All 'code' (including configuration to build the code) is under 'src' folder...

```console
src
├── api            //<- remote service facade used by the app goes here
├── app            //<- application source (ES6, JSX, SCSS, ...)
├── hooks          //<- react hooks
├── mocks          //<- for testing without backend
├── lib            //<- external libraries in source form (see ATTRIBUTION.md)
├── store          //<- contains state of the application
└── web            //<- web related assets bundled with code in app and lib folders
```

> **NOTE:**
> I have seen some starter kits name the 'api' folder as 'service', probably
> to suggest that the app uses the 'service'. I prefer 'api' because an app
> may use different services. Also instructive is to read the differences
> between [facade and service](https://stackoverflow.com/questions/15038324/are-the-roles-of-a-service-and-a-fa%c3%a7ade-similar#15079958)

### Build

The dashboard now uses [Vite](https://vitejs.dev/) to provide a fast development
server and production build. Run `npm run dev` while developing and
`npm run build` to create the optimized output.


### Application


Application code is under 'app' folder. The file main.js is the entry
point and contains the 'shell' of a PWA.

```console
app
├── components     //<- reusable widgets within the app
├── main.js        //<- app shell
├── main.scss      //<- app wide look and feel *may* go here
├── pages          //<- are pages or containers in a flow
```

### Application State

The global state of an application is under 'store' folder, optionally present
when an application requires complex state management. We refer using the 'ducks'
way of organizing the store when using Redux.

### Web Assets

HTML, templates, images, icons and other visual and structural assets are in
the 'web' folder. These are then copied to the 'build' folder during the build
process.

```console
web
├── assets
├── index.ejs
:
└── manifest.json
```

### Third party libraries

External libraries used in source form are under 'lib' folder. The
ATTRIBUTION.md file contains a list of such libraries used by the application
and in what form.

```console
lib
├── ATTRIBUTION.md //<- FOSS packages used by the app listed here
└── tiny           //<- tiny library that you create to prevent bloat goes here
```
