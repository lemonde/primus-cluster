const http = require("http");
const async = require("async");
const Primus = require("primus");
const PrimusEmitter = require("primus-emitter");
const PrimusRooms = require("primus-rooms");
const PrimusCluster = require("../lib");

function createPrimus() {
  const server = http.createServer();
  const primus = new Primus(server, {
    cluster: {
      redis: {
        host: process.env.REDIS_HOST ?? undefined,
        port: process.env.REDIS_PORT ?? undefined,
      },
    },
  });

  // Plugins.
  primus.plugin("emitter", PrimusEmitter);
  primus.plugin("rooms", PrimusRooms);
  primus.plugin("cluster", PrimusCluster);

  primus.on("connection", (spark) => {
    spark.join("myroom");
  });

  server.listen(0);
  primus.port = server.address().port;

  return primus;
}

function getClient(primus, cb) {
  const client = new primus.Socket("http://localhost:" + primus.port);
  client.on("open", () => {
    cb(null, client);
  });
}

function expectClientToReceive(client, expectedMsg, cb) {
  client.on("data", (msg) => {
    try {
      expect(expectedMsg).toEqual(msg);
      cb();
    } catch (error) {
      cb(error);
    }
  });
}

describe("Primus cluster", () => {
  describe("E2E", () => {
    let servers;
    let clients;

    beforeEach((done) => {
      const cbs = [];
      servers = [];
      clients = [];

      for (var i = 0; i < 2; i++) {
        servers[i] = createPrimus();
        cbs.push(getClient.bind(null, servers[i]));
      }

      async.parallel(cbs, function (err, _clients) {
        if (err) return done(err);
        clients = _clients;
        done();
      });
    });

    afterEach((done) => {
      async.parallel(
        servers.map((server) => {
          return (cb) => server.destroy({}, cb);
        }),
        done
      );
    });

    it('should forward message using "write" method', (done) => {
      async.parallel(
        [
          expectClientToReceive.bind(null, clients[0], "hello"),
          expectClientToReceive.bind(null, clients[1], "hello"),
        ],
        done
      );

      servers[0].write("hello");
    });

    it('should forward message using "send" method', (done) => {
      async.parallel(
        [
          expectClientToReceive.bind(null, clients[0], {
            type: 0,
            data: ["hello"],
          }),
          expectClientToReceive.bind(null, clients[1], {
            type: 0,
            data: ["hello"],
          }),
        ],
        done
      );

      servers[0].send("hello");
    });

    it("should forward room message", (done) => {
      async.parallel(
        [
          expectClientToReceive.bind(null, clients[0], "hello"),
          expectClientToReceive.bind(null, clients[1], "hello"),
        ],
        done
      );

      servers[0].room("myroom").write("hello");
    });
  });
});
