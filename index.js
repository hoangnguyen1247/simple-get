var http = require('http')
var https = require('https')
var once = require('once')
var url = require('url')
var zlib = require('zlib')

module.exports = function simpleGet (opts, cb) {
  if (typeof opts === 'string')
    opts = parseOptsUrl({ url: opts })
  if (typeof cb !== 'function')
    cb = function () {}
  cb = once(cb)

  // Follow up to 10 redirects by default
  if (opts.maxRedirects === 0)
    return cb(new Error('too many redirects'))
  if (!opts.maxRedirects)
    opts.maxRedirects = 10

  if (opts.url) parseOptsUrl(opts)

  // Accept gzip/deflate
  if (!opts.headers) opts.headers = {}
  var customAcceptEncoding = Object.keys(opts.headers).some(function (h) {
    return h.toLowerCase() === 'accept-encoding'
  })
  if (!customAcceptEncoding)
    opts.headers['accept-encoding'] = 'gzip, deflate'

  // Support http: and https: urls
  var protocol = opts.protocol === 'https:' ? https : http

  var req = protocol.get(opts, function (res) {
    // Follow 3xx redirects
    if (res.statusCode >= 300 && res.statusCode < 400 && 'location' in res.headers) {
      opts.url = res.headers.location
      parseOptsUrl(opts)

      res.resume() // Discard response

      opts.maxRedirects -= 1
      return simpleGet(opts, cb)
    }

    // Handle gzip/deflate
    if (['gzip', 'deflate'].indexOf(res.headers['content-encoding']) !== -1) {
      // Pipe the response through an unzip stream (gunzip, inflate) and wrap it so it
      // looks like an `http.IncomingMessage`.
      var stream = zlib.createUnzip()
      res.pipe(stream)
      res.on('close', function () { stream.emit('close') })
      stream.httpVersion = res.httpVersion
      stream.headers = res.headers
      stream.trailers = res.trailers
      stream.setTimeout = res.setTimeout.bind(res)
      stream.method = res.method
      stream.url = res.url
      stream.statusCode = res.statusCode
      stream.socket = res.socket
      cb(null, stream)
    } else {
      cb(null, res)
    }
  })

  req.on('error', cb)
}

function parseOptsUrl (opts) {
  var loc = url.parse(opts.url)
  delete opts.url
  if (loc.hostname) opts.hostname = loc.hostname
  if (loc.port) opts.port = loc.port
  if (loc.protocol) opts.protocol = loc.protocol
  opts.path = loc.path
  return opts
}
