const childProcess = require('child_process')
const once = require('one-time')

const MACOS = 'darwin'
const LINUX = 'linux'
const WIN32 = 'win32'

class Say {
  constructor () {
    this.setPlatform(process.platform)
    this.child = null
  }

  /**
   * Override the default platform value
   *
   * @param {string} platform Override the platform
   */
  setPlatform (platform) {
    if (platform === MACOS) {
      this.command = 'say'
      this.baseSpeed = 175
    } else if (platform === LINUX) {
      this.command = 'festival'
      this.baseSpeed = 100
    } else if (platform === WIN32) {
      this.command = 'powershell'
      this.baseSpeed = 0 // unsupported
    } else {
      throw new Error(`new Say(): unsupported platorm! ${platform}`)
    }

    this.platform = platform
  }

  /**
   * Uses system libraries to speak text via the speakers.
   *
   * @param {string} text Text to be spoken
   * @param {string|null} voice Name of voice to be spoken with
   * @param {number|null} speed Speed of text (e.g. 1.0 for normal, 0.5 half, 2.0 double)
   * @param {Function|null} callback A callback of type function(err) to return.
   */
  speak (text, voice, speed, callback) {
    if (typeof callback !== 'function') {
      callback = () => {}
    }

    callback = once(callback)

    if (!text) {
      return setImmediate(() => {
        callback(new TypeError('say.speak(): must provide text parameter'))
      })
    }

    let args = []
    let pipedData = ''
    let options = {}

    // tailor command arguments to specific platforms
    if (this.platform === MACOS) {
      if (!voice) {
        args.push(text)
      } else {
        args.push('-v', voice, text)
      }

      if (speed) {
        args.push('-r', this.convertSpeed(speed))
      }
    } else if (this.platform === LINUX) {
      args.push('--pipe')

      if (speed) {
        pipedData += `(Parameter.set 'Audio_Command "aplay -q -c 1 -t raw -f s16 -r $(($SR*${this.convertSpeed(speed)}/100)) $FILE") `
      }

      if (voice) {
        pipedData += `(${voice}) `
      }

      pipedData += `(SayText "${text}")`
    } else if (this.platform === WIN32) {
      pipedData += text
      args.push('Add-Type -AssemblyName System.speech; $speak = New-Object System.Speech.Synthesis.SpeechSynthesizer; [Console]::InputEncoding = [System.Text.Encoding]::UTF8; $speak.Speak([Console]::In.ReadToEnd())')
      options.shell = true
    }

    this.child = childProcess.spawn(this.command, args, options)

    this.child.stdin.setEncoding('ascii')
    this.child.stderr.setEncoding('ascii')

    if (pipedData) {
      this.child.stdin.end(pipedData)
    }

    this.child.stderr.once('data', (data) => {
      // we can't stop execution from this function
      callback(new Error(data))
    })

    this.child.addListener('exit', (code, signal) => {
      if (code === null || signal !== null) {
        return callback(new Error(`say.speak(): could not talk, had an error [code: ${code}] [signal: ${signal}]`))
      }

      this.child = null

      callback(null)
    })
  }

  /**
   * Uses system libraries to speak text via the speakers.
   *
   * @param {string} text Text to be spoken
   * @param {string|null} voice Name of voice to be spoken with
   * @param {number|null} speed Speed of text (e.g. 1.0 for normal, 0.5 half, 2.0 double)
   * @param {string} filename Path to file to write audio to, e.g. "greeting.wav"
   * @param {Function|null} callback A callback of type function(err) to return.
   */
  export (text, voice, speed, filename, callback) {
    if (typeof callback !== 'function') {
      callback = () => {}
    }

    callback = once(callback)

    if (!text) {
      return setImmediate(() => {
        callback(new TypeError('say.export(): must provide text parameter'))
      })
    }

    if (!filename) {
      return setImmediate(() => {
        callback(new TypeError('say.export(): must provide filename parameter'))
      })
    }

    let args = []

    // tailor command arguments to specific platforms
    if (this.platform === MACOS) {
      if (!voice) {
        args.push(text)
      } else {
        args.push('-v', voice, text)
      }

      if (speed) {
        args.push('-r', this.convertSpeed(speed))
      }

      if (filename) {
        args.push('-o', filename, '--data-format=LEF32@32000')
      }
    } else {
      // if we don't support the platform, callback with an error (next tick) - don't continue
      return setImmediate(() => {
        callback(new Error(`say.export(): does not support platform ${this.platform}`))
      })
    }

    this.child = childProcess.spawn(this.command, args)

    this.child.stdin.setEncoding('ascii')
    this.child.stderr.setEncoding('ascii')

    this.child.stderr.once('data', (data) => {
      // we can't stop execution from this function
      callback(new Error(data))
    })

    this.child.addListener('exit', (code, signal) => {
      if (code === null || signal !== null) {
        return callback(new Error(`say.export(): could not talk, had an error [code: ${code}] [signal: ${signal}]`))
      }

      this.child = null

      callback(null)
    })
  }

  /**
   * Stops currently playing audio. There will be unexpected results if multiple audios are being played at once
   *
   * TODO: If two messages are being spoken simultaneously, childD points to new instance, no way to kill previous
   *
   * @param {Function|null} callback A callback of type function(err) to return.
   */
  stop (callback) {
    if (typeof callback !== 'function') {
      callback = () => {}
    }

    callback = once(callback)

    if (!this.child) {
      return setImmediate(() => {
        callback(new Error('say.stop(): no speech to kill'))
      })
    }

    if (this.platform === LINUX) {
      // TODO: Need to ensure the following is true for all users, not just me. Danger Zone!
      // On my machine, original childD.pid process is completely gone. Instead there is now a
      // childD.pid + 1 sh process. Kill it and nothing happens. There's also a childD.pid + 2
      // aplay process. Kill that and the audio actually stops.
      process.kill(this.child.pid + 2)
    } else if (this.platform === WIN32) {
      this.child.stdin.pause()
      childProcess.exec(`taskkill /pid ${this.child.pid} /T /F`)
    } else {
      this.child.stdin.pause()
      this.child.kill()
    }

    this.child = null

    callback(null)
  }

  convertSpeed (speed) {
    return Math.ceil(this.baseSpeed * speed)
  }
}

module.exports = new Say()
module.exports.platforms = {
  WIN32: WIN32,
  MACOS: MACOS,
  LINUX: LINUX
}
