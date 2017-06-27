const { execSync } = require('child_process')
const chalk = require('chalk')
const fs = require('fs')
const hasYarn = require('has-yarn')
const ora = require('ora')
const path = require('path')
const version = require('version')

const cwd = process.cwd()
const pkgPath = path.join(cwd, 'package.json')

if (!fs.existsSync(pkgPath)) {
  unsupported()
  process.exit()
}

const pkg = require(pkgPath)
const isReactDom = 'react-dom' in pkg.dependencies
const isReactNative = 'react-native' in pkg.dependencies

// exit if this is already a views-morph process
if ('views-morph' in pkg.devDependencies) {
  console.log(chalk.blue(`This is already a Views project! 🔥 🎉 \n`))
  help()
  process.exit()
}

if (!isReactDom && !isReactNative) {
  unsupported()
  process.exit()
}

console.log(
  `In a few minutes, your ${isReactDom
    ? 'web'
    : 'native'} project will be ready to use Views! 😇\n`
)

let spinner = ora('Getting the latest versions of Views dependencies').start()

function getViewsMorphDependency() {
  version.fetch('views-morph', function(err, version) {
    if (err) return console.error(err)

    pkg.devDependencies['views-morph'] = `^${version}`

    getReactRouterDependency()
  })
}

function getReactRouterDependency() {
  const dep = isReactDom ? 'react-router-dom' : 'react-router-native'
  version.fetch(dep, function(err, version) {
    if (err) return console.error(err)

    pkg.dependencies[dep] = `^${version}`

    getAnimated()
  })
}

function getAnimated() {
  if (isReactDom) {
    version.fetch('animated', function(err, version) {
      if (err) return console.error(err)

      pkg.dependencies.animated = `^${version}`

      getConcurrentlyDependency()
    })
  } else {
    getConcurrentlyDependency()
  }
}

function getConcurrentlyDependency() {
  version.fetch('concurrently', function(err, version) {
    if (err) return console.error(err)

    pkg.devDependencies['concurrently'] = `^${version}`

    setup()
  })
}

function setup() {
  spinner.succeed()
  spinner = ora('Setting up the project').start()

  // setup scripts
  pkg.scripts.dev = pkg.scripts.start
  pkg.scripts.start = `concurrently "npm run dev" "npm run views"`
  pkg.scripts.views = `views-morph src --watch --as ${isReactDom
    ? 'react-dom'
    : 'react-native'}`
  if (isReactDom) {
    pkg.scripts.prebuild = `views-morph src --as react-dom --no-tests`
  } else {
    pkg.scripts['dev:ios'] = pkg.scripts.ios
    pkg.scripts.ios = `concurrently "npm run dev:ios" "npm run views"`

    pkg.scripts['dev:android'] = pkg.scripts.android
    pkg.scripts.android = `concurrently "npm run dev:android" "npm run views"`
  }

  // write package.json
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2))

  spinner.succeed()
  spinner = ora('Installing the dependencies').start()

  // install the dependencies
  execSync(hasYarn(cwd) ? 'yarn' : 'npm install')

  spinner.succeed()
  spinner = ora('Preparing a sample View for you to work with').start()

  // bootstrap files
  if (isReactDom) {
    // in src/index.js
    const indexPath = path.join(cwd, 'src', 'index.js')
    const index = fs.readFileSync(indexPath, { encoding: 'utf-8' })
    // set App to load App.view.logic
    fs.writeFileSync(indexPath, index.replace(`./App`, `./App.view.logic.js`))

    // remove unused files
    ;['App.css', 'App.js', 'App.test.js', 'logo.svg'].forEach(f =>
      fs.unlinkSync(path.join(cwd, 'src', f))
    )

    // write views flexbox first css
    fs.writeFileSync(path.join(cwd, 'src', 'index.css'), VIEWS_CSS)

    // write App.view.logic.js
    fs.writeFileSync(
      path.join(cwd, 'src', 'App.view.logic.js'),
      APP_VIEW_LOGIC_DOM
    )
  } else {
    // create a src directory
    fs.mkdirSync(path.join(cwd, 'src'))

    // write App.js
    fs.writeFileSync(path.join(cwd, 'App.js'), APP_NATIVE)

    // write App.view.logic.js
    fs.writeFileSync(
      path.join(cwd, 'src', 'App.view.logic.js'),
      APP_VIEW_LOGIC_NATIVE
    )

    // write fonts.js
    fs.writeFileSync(path.join(cwd, 'src', 'fonts.js'), FONTS_NATIVE)
  }

  // add views generated files to .gitignore
  fs.appendFileSync(path.join(cwd, '.gitignore'), GITIGNORE)

  // write App.view
  fs.writeFileSync(path.join(cwd, 'src', 'App.view'), APP_VIEW)

  spinner.succeed()

  console.log('🦄 \n')

  // :)
  console.log(chalk.blue(`This is now a Views project 🎉!!!`))

  console.log(
    `Go ahead and open the file ${chalk.green(
      'src/App.view'
    )} in your editor and change something ✏️`
  )
  console.log(
    `If this is your first time using Views, here's how to get your editor to understand Views files ${chalk.blue(
      'https://github.com/viewsdx/docs#syntax-highlighting'
    )}`
  )
  help()
}

function help() {
  if (isReactDom) {
    console.log(
      `Run it with ${hasYarn(cwd)
        ? chalk.green('yarn start')
        : chalk.green('npm start')}\n`
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
    `You can find the docs at ${chalk.blue('https://github.com/viewsdx/docs')}`
  )
  getInTouch()
  console.log(`Happy coding! :)`)
}

function unsupported() {
  console.log(
    `It looks like the directory you're on isn't either a create-react-app or create-react-native-app project.`
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
    chalk.green(`npm install --global create-react-native-app
create-react-native-app my-native-app
cd my-native-app
use-views`)
  )

  getInTouch()
}

function getInTouch() {
  console.log(
    `\nIf you need any help, get in touch at ${chalk.blue(
      'https://twitter.com/viewsdx'
    )} or`
  )
  console.log(
    `join our Slack community at ${chalk.blue('https://slack.viewsdx.com')}\n`
  )
}

// start
getViewsMorphDependency()

// files
const APP_VIEW = `App is Vertical
alignItems center
flex 1
justifyContent center
transform props.transform
height props.height
width props.width
Text
fontSize 18
text Hello Views :)!`

const APP_VIEW_LOGIC_DOM = `import { spring, Value } from 'animated'
import React from 'react'
import App from './App.view.js'

const width = window.innerWidth
  || document.documentElement.clientWidth
  || document.body.clientWidth

const height = window.innerHeight
  || document.documentElement.clientHeight
  || document.body.clientHeight

export default class AppLogic extends React.Component {
  // this is our animated value
  // we use react-native Animated for this, see their docs:
  // https://facebook.github.io/react-native/docs/animated.html
  // https://github.com/animatedjs/animated
  a = new Value(0)

  componentWillMount() {
    // and here we make it pop through a spring animation! :)
    spring(this.a, { toValue: 1 }).start()
  }

  // get the values we want to animate
  getAnimated() {
    return {
      transform: [
        {
          scale: this.a,
        },
      ],
    }
  }

  render() {
    // pass the animated values to the view
    return <App {...this.getAnimated()} height={height} width={width} />
  }
}`

const APP_VIEW_LOGIC_NATIVE = `import { AppLoading, Font } from 'expo'
import { Animated, Dimensions } from 'react-native'
import fonts from './fonts.js'
import React from 'react'
import App from './App.view.js'

const { spring, Value } = Animated
const { height, width } = Dimensions.get('window')

export default class AppLogic extends React.Component {
  // this is our animated value
  // we use react-native Animated for this, see their docs:
  // https://facebook.github.io/react-native/docs/animated.html
  a = new Value(0)

  state = {
    loading: true,
  }

  componentWillMount() {
    this.cacheResourcesAsync()

    // and here we make it pop through a spring animation! :)
    spring(this.a, { toValue: 1 }).start()
  }

  // get the values we want to animate
  getAnimated() {
    return {
      transform: [
        {
          scale: this.a,
        },
      ],
    }
  }

  render() {
    if (this.state.loading) return <AppLoading />

    // pass the animated values to the view
    return <App {...this.getAnimated()} height={height} width={width} />
  }

  async cacheResourcesAsync() {
    await Font.loadAsync(fonts)

    this.setState({
      loading: false,
    })
  }
}`

const APP_NATIVE = `import App from './src/App.view.logic.js'
export default App`

const FONTS_NATIVE = `export default {
// At some point, Views will do this automatically. For now, you
// need to write your fonts by hand. Here's an example of a font used like:
// Text
// fontFamily Robot Mono
// fontWeight 300
// text hey I'm using Roboto Mono!
//
// Font definition:
//
//  'RobotoMono-300': require('./assets/fonts/RobotoMono-300.ttf'),
//
}`

const GITIGNORE = `
# views
**/*.data.js
**/*.view.js
**/*.view.css
**/*.view.tests.js`

const VIEWS_CSS = `* {
  -webkit-overflow-scrolling: touch;
}
html, body, #root {
  height: 100%;
  margin: 0;
}
a,button,div,img,input,form,h1,h2,h3,h4,h5,h6,h7,nav,label,li,ol,p,span,svg,ul {
  box-sizing: border-box;
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  flex-shrink: 0;
  margin: 0;
  padding: 0;
  outline: 0;
  text-decoration: none;
  color: inherit;
}
a,button,input {
  background-color: transparent;
  border: 0;
  margin: 0;
  padding: 0;
  white-space: normal;
  line-height: inherit;
  text-align: left;
  font-family: inherit;
  font-size: inherit;
}
button::-moz-focus-inner {
  border: 0;
  margin: 0;
  padding: 0;
}`
