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

| task       | command line       | notes                                          |
| :--------- | :----------------- | :--------------------------------------------- |
| install    | `npm install`      | installs dependencies                          |
| lint       | `npm run lint`     | run eslint on `src` folder                     |
| lint:fix   | `npm run lint:fix` | run eslint on `src` folder                     |
| build      | `npm run build`    | compile to `dist` folder |
| start      | `npm run start`    | web serve `dist` folder |
| dev        | `npm run dev`      | run development server with HMR |
| test       | `npm run test`     | run tests and report coverage                  |
| test:watch | `npm run test`     | run tests in watch mode without coverage       |

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
├── dist           //<- generated and bundled files ready for deployment
├── index.html     //<- Vite entry point
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
└── web            //<- static assets consumed by index.html
```

> **NOTE:**
> I have seen some starter kits name the 'api' folder as 'service', probably
> to suggest that the app uses the 'service'. I prefer 'api' because an app
> may use different services. Also instructive is to read the differences
> between [facade and service](https://stackoverflow.com/questions/15038324/are-the-roles-of-a-service-and-a-fa%c3%a7ade-similar#15079958)

### Vite

Vite configuration lives in `vite.config.js` at the project root. The
configuration treats the top-level `index.html` file as the entry point,
mirrors the historic webpack alias map so imports such as `import
configureStore from 'store'` continue to work without rewrites, and publishes
any static assets found in `src/web/assets`. Running `npm run dev` serves the
application with hot module replacement, while `npm run build` emits the
production bundle into `dist/`.


### Application

Application code is under 'app' folder. The file main.jsx is the entry
point and contains the 'shell' of a PWA. React components and pages use the
`.jsx` extension.

```console
app
├── components     //<- reusable widgets within the app
├── main.jsx       //<- app shell
├── main.scss      //<- app wide look and feel *may* go here
├── pages          //<- are pages or containers in a flow
```

### Application State

The global state of an application is under 'store' folder, optionally present
when an application requires complex state management. We refer using the 'ducks'
way of organizing the store when using Redux.

### Web Assets

HTML, templates, images, icons and other visual and structural assets live in
the 'web/assets' folder. These are copied to the 'dist' folder during the
build process alongside the compiled bundle that starts from the root level
`index.html` file.

```console
web
└── assets
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
