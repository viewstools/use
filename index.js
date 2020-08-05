let { existsSync, promises: fs } = require('fs')
let util = require('util')
let exec = util.promisify(require('child_process').exec)
let chalk = require('chalk')
let hasYarn = require('has-yarn')
let ora = require('ora')
let path = require('path')
let getLatestVersion = require('latest-version')

let cwd = process.cwd()
let pkgPath = path.join(cwd, 'package.json')

if (!existsSync(pkgPath)) {
  unsupported()
  process.exit()
}

let pkg = require(pkgPath)
let isReactNative = 'react-native' in pkg.dependencies
let isReactDom = !isReactNative && 'react-dom' in pkg.dependencies

if (!pkg.devDependencies) {
  pkg.devDependencies = {}
}

// exit if this is already a views-morph project
if ('@viewstools/morph' in pkg.dependencies) {
  console.log(chalk.blue(`This is already a Views project! 🔥 🎉 \n`))
  help()
  process.exit()
}

if (!isReactDom && !isReactNative) {
  unsupported()
  process.exit()
}

console.log(
  `In a few minutes, your ${
    isReactDom ? 'web' : 'native'
  } project will be ready to use Views! 😇\n`
)

let spinner = ora('Getting the latest versions of Views dependencies').start()

async function addDependency(dep) {
  let version = await getLatestVersion(dep)
  pkg.dependencies[dep] = `^${version}`
}

async function run() {
  // dependencies
  // await Promise.all([
  //   addDependency('@viewstools/morph'),
  //   addDependency('concurrently'),
  //   addDependency('husky'),
  //   addDependency('lint-staged'),
  //   addDependency('prettier'),
  //   addDependency('immer'),
  //   addDependency('graphql'),
  //   addDependency('graphql-tag'),
  //   addDependency('urql'),
  //   addDependency('react-spring'),
  // ])

  if (isReactDom) {
    await addDependency('@viewstools/create-react-app')
    // await Promise.all([
    //   addDependency('emotion'),
    //   addDependency('react-app-rewired'),
    //   addDependency('customize-cra'),
    //   addDependency('customize-cra-react-refresh'),
    //   addDependency('internal-ip'),
    //   addDependency('use-media'),
    //   addDependency('@viewstools/use-masked-input'),
    //   addDependency('react-app-polyfill'),
    //   addDependency('@reach/dialog'),
    //   addDependency('mousetrap'),
    //   addDependency('react-virtualized-auto-sizer'),
    //   addDependency('react-window'),
    // ])

    pkg.browserslist = {
      production: ['>0.2%', 'not dead', 'not op_mini all', 'ios > 9'],
      development: [
        'last 1 chrome version',
        'last 1 firefox version',
        'last 1 safari version',
      ],
    }
  } else if (isReactNative) {
    await addDependency('@viewstools/create-expo-app')
    // addDependency('d3-ease')
  }

  pkg.husky = {
    hooks: {
      'pre-commit': 'lint-staged',
    },
  }

  pkg['lint-staged'] = {
    '*.{js,json,css,md}': ['prettier --write', 'git add'],
  }

  spinner.succeed()
  spinner = ora('Setting up the project').start()

  // setup scripts
  pkg.scripts['start:react'] = pkg.scripts.start
  pkg.scripts.start = `concurrently --kill-others npm:start:*`
  pkg.scripts['start:views'] = `views-morph src --watch --as ${
    isReactDom ? 'react-dom' : 'react-native'
  }`
  if (isReactDom) {
    pkg.scripts['start:react'] =
      'LOCAL_IP=`node -e "process.stdout.write(require(\'internal-ip\').v4.sync())"` react-app-rewired start'
    pkg.scripts.prebuild = `views-morph src --as react-dom`
    pkg.scripts.build = 'react-app-rewired build'
    pkg.scripts.test = 'react-app-rewired test'
  }

  // write package.json
  await fs.writeFile(pkgPath, JSON.stringify(pkg, null, 2))

  spinner.succeed()
  spinner = ora('Installing the dependencies').start()

  let installCommand = hasYarn(cwd) ? 'yarn' : 'npm install'
  // clear yarn.lock, it's causing issues with fsevents from time to time
  try {
    await fs.unlink(path.join(cwd, 'yarn.lock'))
  } catch (error) {}
  // install the dependencies
  await exec(installCommand)
  // TODO handle errors when installing the dependencies

  spinner.succeed()
  spinner = ora('Preparing a sample View for you to work with').start()

  // create a src directory
  try {
    await fs.mkdir(path.join(cwd, 'src'))
  } catch (err) {}
  try {
    await fs.mkdir(path.join(cwd, 'src', 'App'))
  } catch (err) {}

  await fs.writeFile(path.join(cwd, '.prettierrc'), PRETTIER_RC)

  // bootstrap files
  if (isReactDom) {
    // in src/index.js
    let indexPath = path.join(cwd, 'src', 'index.js')
    let index = await fs.readFile(indexPath, { encoding: 'utf-8' })
    // set App to load App/logic.js
    await fs.writeFile(
      indexPath,
      `import 'react-app-polyfill/stable'
import '@reach/dialog/styles.css'
import './version.js'
${index.replace(`./App`, `./App/logic.js`)}

// not ideal but...
let error = window.console.error;
window.console.error = (...args) => {
  if (/(cannot appear as a descendant of|must have either an)/.test(args[0]))
    return;

  error(...args);
};`
    )

    // remove unused files
    await Promise.all(
      ['App.css', 'App.js', 'App.test.js', 'logo.svg'].map(async f => {
        try {
          await fs.unlink(path.join(cwd, 'src', f))
        } catch (err) {}
      })
    )

    await Promise.all(
      [
        // write views flexbox first css
        [path.join(cwd, 'src', 'index.css'), VIEWS_CSS],
        // write App.view.logic.js
        [path.join(cwd, 'src', 'App', 'logic.js'), APP_VIEW_LOGIC_DOM],
        // setup react-refresh
        [path.join(cwd, 'config-overrides.js'), CONFIG_OVERRIDES],
        [path.join(cwd, '.eslintrc'), ESLINTRC],
        [path.join(cwd, '.env.development'), ENV_DEVELOPMENT],
        [path.join(cwd, 'src', 'version.js'), VERSION],
        [path.join(cwd, 'jsconfig.json'), JSCONFIG_JSON],
      ].map(([file, content]) => fs.writeFile(file, content))
    )
  } else {
    await Promise.all(
      [
        [path.join(cwd, 'App.js'), APP_NATIVE],
        [path.join(cwd, 'src', 'App', 'logic.js'), APP_VIEW_LOGIC_NATIVE],
        [path.join(cwd, 'babel.config.js'), BABEL_CONFIG_JS_NATIVE],
      ].map(([file, content]) => fs.writeFile(file, content))
    )

    await exec('expo install react-native-svg')
  }

  // add views generated files to .gitignore
  await fs.appendFile(path.join(cwd, '.gitignore'), GITIGNORE)

  // write App.view
  await fs.writeFile(path.join(cwd, 'src', 'App', 'view.blocks'), APP_VIEW)

  spinner.succeed()

  console.log('🦄 \n')

  // :)
  console.log(chalk.blue(`This is now a Views project 🎉!!!`))

  console.log(
    `Go ahead and open the file ${chalk.green(
      'src/App/view.blocks'
    )} in your editor and change something ✏️`
  )
  console.log(
    `If this is your first time using Views, here's how to get your editor to understand Views files ${chalk.blue(
      'https://github.com/viewstools/docs#syntax-highlighting'
    )}`
  )
  help()
}

function help() {
  if (isReactDom) {
    console.log(
      `Run it with ${
        hasYarn(cwd) ? chalk.green('yarn start') : chalk.green('npm start')
      }\n`
    )
  } else {
    console.log(
      `Run the iOS simulator with ${chalk.green(
        'npm run ios'
      )} and the Android one with ${chalk.green('npm run android')}`
    )
    console.log(`
Sometimes the simulator fails to load. You will want to stop the command by pressing
${chalk.yellow('ctrl+c')} and running ${chalk.yellow('npm start')} instead.
If the simulator is already open, press the button to try again.

You can also use a real device for testing, https://github.com/react-community/create-react-native-app#npm-run-ios
for more info.`)
  }
  console.log(
    `You can find the docs at ${chalk.blue('https://docs.views.tools')}`
  )
  getInTouch()
  console.log(`Happy coding! :)`)
}

function unsupported() {
  console.log(
    `It looks like the directory you're on isn't either a create-react-app or expo (react native) project.`
  )
  console.log(`Is ${chalk.yellow(cwd)} the right folder?\n`)
  console.log(
    `If you don't have a project and want to make a new one, follow these instructions:`
  )
  console.log(`For ${chalk.blue('React DOM')}, ie, a web project:`)
  console.log(
    chalk.green(`npm install --global create-react-app
create-react-app my-app
cd my-app
use-views`)
  )

  console.log(
    `\nFor ${chalk.blue('React Native')}, ie, an iOS or Android project:`
  )
  console.log(
    chalk.green(`npm install --global expo-cli
# choose the blank template and follow expo's wizard
expo init my-native-app
cd my-native-app
use-views`)
  )

  getInTouch()
}

function getInTouch() {
  console.log(
    `\nIf you need any help, join our GitHub community at ${chalk.blue(
      'https://docs.views.tools'
    )}\n`
  )
}

// start
run()

// files
let APP_VIEW = `App View
is together
  Vertical
  alignItems center
  flexBasis auto
  flexGrow 1
  flexShrink 1
  justifyContent center
    Text
    fontSize 18
    text Hello Views Tools!`

let APP_VIEW_LOGIC_DOM = `import { ViewsFlow } from 'Logic/ViewsFlow.js'
import View from './view.js'
import React from 'react'

export default function Logic(props) {
  return (
    <ViewsFlow>
      <View {...props} />
    </ViewsFlow>
  )
}`

let APP_VIEW_LOGIC_NATIVE = `import { useFonts } from 'expo-font';
import { ViewsFlow } from 'Logic/ViewsFlow.js';
import React from 'react';
import View from './view.js';

export default function Logic(props) {
  let [loaded] = useFonts({
    // At some point, Views will do this automatically. For now, you
    // need to write your fonts by hand.
    //
    // 1) Download the font into src/DesignSystem/Fonts. The name of the file is FontFamily-Weight.ttf
    // 2) Use it in a view:
    //    Text
    //    fontFamily Robot Mono
    //    fontWeight 300
    //    text hey I'm using Roboto Mono!
    // 3) Add it to this object like:
    //
    // 'Montserrat-300': require('../DesignSystem/Fonts/Montserrat-300.ttf'),
  });

  if (!loaded) return null

  return (
    <ViewsFlow>
      <View {...props} />
    </ViewsFlow>
  );
}`

let APP_NATIVE = `import App from './src/App/logic.js'
export default App`

let GITIGNORE = `
# views
**/view.js
**/DesignSystem/Fonts/*.js
src/Data/ViewsData.js
src/Logic/ViewsFlow.js
src/Logic/ViewsToolsDesignSystem.js
src/Logic/useIsBefore.js
src/Logic/useIsMedia.js
src/Logic/useIsHovered.js
src/Logic/ViewsTools.js`

let VIEWS_CSS = `* {
  -webkit-overflow-scrolling: touch;
  -ms-overflow-style: -ms-autohiding-scrollbar;
}
html,
body,
#root {
  height: 100%;
  margin: 0;
}
.views-block, #root {
  align-items: stretch;
  background-color: transparent;
  border-radius: 0;
  border: 0;
  box-sizing: border-box;
  color: inherit;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  font-family: inherit;
  font-size: inherit;
  hyphens: auto;
  line-height: inherit;
  margin: 0;
  outline: 0;
  overflow-wrap: break-word;
  padding: 0;
  position: relative;
  text-align: left;
  text-decoration: none;
  white-space: normal;
  word-wrap: break-word;
}
.views-text {
  box-sizing: border-box;
  hyphens: auto;
  outline: 0;
  overflow-wrap: break-word;
  word-wrap: break-word;
}
.views-capture {
  background-color: transparent;
  box-sizing: border-box;
  border-radius: 0;
  border: 0;
  hyphens: auto;
  outline: 0;
  overflow-wrap: break-word;
  word-wrap: break-word;
}
.views-capture::-moz-focus-inner {
  border: 0;
  margin: 0;
  padding: 0;
}
/* remove number arrows */
.views-capture[type='number']::-webkit-outer-spin-button,
.views-capture[type='number']::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}`

let JSCONFIG_JSON = `{
  "compilerOptions": {
    "baseUrl": "src",
    "skipLibCheck": true
  },
  "include": ["src"]
}`

let CONFIG_OVERRIDES = `let { override } = require('customize-cra')
let { addReactRefresh } = require('customize-cra-react-refresh')

module.exports = override(addReactRefresh())`

let PRETTIER_RC = `{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "es5"
}`

let ESLINTRC = `{
  "extends": "react-app"
}`

let ENV_DEVELOPMENT = `REACT_APP_API=http://$LOCAL_IP:8080/v1/graphql
REACT_APP_API_KEY=secret
REACT_APP_ENV=development
REACT_APP_NAME=$npm_package_name
REACT_APP_VERSION=$npm_package_version`

let VERSION = `window.viewsApp = {
  api: process.env.REACT_APP_API,
  app: process.env.REACT_APP_NAME,
  env: process.env.REACT_APP_ENV,
  version: process.env.REACT_APP_VERSION,
}`

let BABEL_CONFIG_JS_NATIVE = `let fs = require('fs');

module.exports = function (api) {
  api.cache(true)

  // Support absolute imports from src like
  // https://create-react-app.dev/docs/importing-a-component/#absolute-imports
  let alias = {}
  fs.readdirSync('./src').forEach(item => {
    alias[item] = \`./src/\${item}\`
  })

  return {
    presets: ['babel-preset-expo'],
    plugins: [['module-resolver', { alias }]],
  }
}`
