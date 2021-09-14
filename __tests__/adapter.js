const { promisify } = require("util");
const redis = require("redis");
const async = require("async");
const { Adapter } = require("../lib/adapter");

describe("Adapter", () => {
  let adapter;
  let client;
  let publish;

  beforeEach(async () => {
    publish = jest.fn();
    client = redis.createClient({
      host: process.env.REDIS_HOST ?? undefined,
      port: process.env.REDIS_PORT ?? undefined,
    });

    adapter = new Adapter({
      client: client,
      publish: publish,
    });
  });

  afterEach(async () => {
    await promisify(client.flushdb.bind(client))();
    await promisify(client.quit.bind(client))();
  });

  describe("#add", () => {
    it("should add a socket into a room", (done) => {
      adapter.add("12", "my:room:name", (err) => {
        if (err) return done(err);
        adapter.get("12", (err, rooms) => {
          if (err) return done(err);

          expect(rooms).toContain("my:room:name");
          done();
        });
      });
    });

    it("should expire after given ttl", (done) => {
      adapter.ttl = 1;
      adapter.add("12", "my:room:name", (err) => {
        if (err) return done(err);
        setTimeout(() => {
          adapter.get("12", (err, rooms) => {
            if (err) return done(err);

            expect(rooms).not.toContain("my:room:name");
            done();
          });
        }, 1100);
      });
    });

    it("should not expire", (done) => {
      adapter.ttl = 100;
      adapter.add("12", "my:room:name", (err) => {
        if (err) return done(err);

        setTimeout(() => {
          adapter.get("12", (err, rooms) => {
            if (err) return done(err);

            expect(rooms).toContain("my:room:name");
            done();
          });
        }, 1100);
      });
    });
  });

  describe("#get", () => {
    beforeEach((done) => {
      async.series(
        [
          adapter.add.bind(adapter, "12", "my:room:name"),
          adapter.add.bind(adapter, "12", "my:second:room:name"),
        ],
        done
      );
    });

    it("should return client rooms", (done) => {
      adapter.get("12", (err, rooms) => {
        if (err) return done(err);
        expect(rooms).toContain("my:room:name");
        expect(rooms).toContain("my:second:room:name");
        done();
      });
    });

    it("should return all rooms when the `id` argument is falsy", (done) => {
      adapter.get(null, (err, rooms) => {
        if (err) return done(err);
        expect(rooms).toContain("my:room:name");
        expect(rooms).toContain("my:second:room:name");
        done();
      });
    });
  });

  describe("#del", () => {
    beforeEach((done) => {
      async.series(
        [
          adapter.add.bind(adapter, "12", "my:room:name"),
          adapter.add.bind(adapter, "12", "my:second:room:name"),
        ],
        done
      );
    });

    it("should remove room from a client", (done) => {
      adapter.del("12", "my:room:name", (err) => {
        if (err) return done(err);
        adapter.get("12", (err, rooms) => {
          if (err) return done(err);

          expect(rooms).not.toContain("my:room:name");
          done();
        });
      });
    });

    it("should remove client from a room", (done) => {
      adapter.del("12", "my:room:name", (err) => {
        if (err) return done(err);
        adapter.clients("my:room:name", (err, client) => {
          if (err) return done(err);

          expect(client).not.toContain("12");
          done();
        });
      });
    });

    it("should remove all rooms from the client if called without room", (done) => {
      adapter.del("12", null, (err) => {
        if (err) return done(err);
        adapter.get("12", (err, rooms) => {
          if (err) return done(err);
          expect(rooms).toEqual([]);
          done();
        });
      });
    });

    it("should remove client from all rooms if called without room", (done) => {
      adapter.del("12", null, (err) => {
        if (err) return done(err);

        async.series(
          [
            adapter.clients.bind(adapter, "my:room:name"),
            adapter.clients.bind(adapter, "my:second:room:name"),
          ],
          (err, results) => {
            results.forEach((result) => {
              expect(result).not.toContain("12");
            });
            done();
          }
        );
      });
    });
  });

  describe("#clients", () => {
    beforeEach((done) => {
      async.series(
        [
          adapter.add.bind(adapter, "12", "my:room:name"),
          adapter.add.bind(adapter, "13", "my:room:name"),
        ],
        done
      );
    });

    it("should return clients", (done) => {
      adapter.clients("my:room:name", (err, ids) => {
        if (err) return done(err);
        expect(ids).toContain("12");
        expect(ids).toContain("13");
        done();
      });
    });
  });

  describe("#broadcast", () => {
    let clients;
    let data;

    beforeEach((done) => {
      async.series(
        [
          adapter.add.bind(adapter, "marc", "news"),
          adapter.add.bind(adapter, "jose", "sport"),
          adapter.add.bind(adapter, "jose", "news"),
          adapter.add.bind(adapter, "greg", "news"),
          adapter.add.bind(adapter, "vincent", "sport"),
          adapter.add.bind(adapter, "ludowic", "sport"),
          adapter.add.bind(adapter, "ludowic", "news"),
          adapter.add.bind(adapter, "samuel", "geek"),
        ],
        done
      );

      const createSocket = () => {
        return {
          write: jest.fn(),
          send: jest.fn(),
        };
      };

      clients = {
        marc: createSocket(),
        jose: createSocket(),
        greg: createSocket(),
        vincent: createSocket(),
        ludowic: createSocket(),
        samuel: createSocket(),
      };

      data = ["mydata"];
    });

    it("should broadcast to all clients", (done) => {
      adapter.broadcast(data, {}, clients, (err) => {
        if (err) return done(err);
        Object.keys(clients).forEach((id) => {
          var socket = clients[id];
          expect(socket.write).toHaveBeenCalledTimes(1);
        });
        done();
      });
    });

    it("should broadcast to a specific room", (done) => {
      adapter.broadcast(data, { rooms: ["sport", "geek"] }, clients, (err) => {
        if (err) return done(err);
        expect(clients.marc.write).not.toHaveBeenCalled();
        expect(clients.jose.write).toHaveBeenCalledTimes(1);
        expect(clients.greg.write).not.toHaveBeenCalled();
        expect(clients.vincent.write).toHaveBeenCalledTimes(1);
        expect(clients.ludowic.write).toHaveBeenCalledTimes(1);
        expect(clients.samuel.write).toHaveBeenCalledTimes(1);
        done();
      });
    });

    it("should not send to excepted clients (with rooms)", (done) => {
      adapter.broadcast(
        data,
        { rooms: ["sport", "geek"], except: ["jose"] },
        clients,
        (err) => {
          if (err) return done(err);
          expect(clients.marc.write).not.toHaveBeenCalled();
          expect(clients.jose.write).not.toHaveBeenCalled();
          expect(clients.greg.write).not.toHaveBeenCalled();
          expect(clients.vincent.write).toHaveBeenCalledTimes(1);
          expect(clients.ludowic.write).toHaveBeenCalledTimes(1);
          expect(clients.samuel.write).toHaveBeenCalledTimes(1);
          done();
        }
      );
    });

    it("should not send to excepted clients (without rooms)", (done) => {
      adapter.broadcast(data, { except: ["jose"] }, clients, (err) => {
        if (err) return done(err);
        expect(clients.marc.write).toHaveBeenCalledTimes(1);
        expect(clients.jose.write).not.toHaveBeenCalled();
        expect(clients.greg.write).toHaveBeenCalledTimes(1);
        expect(clients.vincent.write).toHaveBeenCalledTimes(1);
        expect(clients.ludowic.write).toHaveBeenCalledTimes(1);
        expect(clients.samuel.write).toHaveBeenCalledTimes(1);
        done();
      });
    });

    it("should called a custom method", (done) => {
      adapter.broadcast(data, { method: "send" }, clients, (err) => {
        if (err) return done(err);
        expect(clients.marc.send).toHaveBeenCalledTimes(1);
        expect(clients.jose.send).toHaveBeenCalledTimes(1);
        expect(clients.greg.send).toHaveBeenCalledTimes(1);
        expect(clients.vincent.send).toHaveBeenCalledTimes(1);
        expect(clients.ludowic.send).toHaveBeenCalledTimes(1);
        expect(clients.samuel.send).toHaveBeenCalledTimes(1);
        done();
      });
    });

    it("should publish data", (done) => {
      adapter.broadcast(
        data,
        { method: "send", except: ["jose"] },
        clients,
        (err) => {
          if (err) return done(err);
          expect(publish).toHaveBeenCalledWith(data, "room", {
            method: "send",
            except: ["jose"],
            rooms: [],
          });
          done();
        }
      );
    });
  });

  describe("#empty", () => {
    beforeEach((done) => {
      async.series(
        [
          adapter.add.bind(adapter, "12", "my:room:name"),
          adapter.add.bind(adapter, "13", "my:room:name"),
        ],
        done
      );
    });

    it("should remove all clients from a room", (done) => {
      adapter.empty("my:room:name", (err) => {
        if (err) return done(err);
        adapter.clients("my:room:name", (err, clients) => {
          if (err) return done(err);
          expect(clients).toHaveLength(0);
          done();
        });
      });
    });
  });

  describe("#isEmpty", () => {
    beforeEach((done) => {
      async.series(
        [
          adapter.add.bind(adapter, "12", "my:room:name"),
          adapter.add.bind(adapter, "13", "my:room:name"),
        ],
        done
      );
    });

    it("should return true if the room is empty", (done) => {
      adapter.isEmpty("my:second:room:name", (err, empty) => {
        if (err) return done(err);
        expect(empty).toBe(true);
        done();
      });
    });

    it("should return false if the room is not empty", (done) => {
      adapter.isEmpty("my:room:name", (err, empty) => {
        if (err) return done(err);
        expect(empty).toBe(false);
        done();
      });
    });
  });

  describe("#_getTimeFraction", () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it("should substract from the current time interval when offset provided", () => {
      const current = adapter._getTimeFraction();
      const oneBefore = adapter._getTimeFraction(1);
      expect(current - 1).toEqual(oneBefore);
    });

    it("should change fraction every 10 seconds if ttl is 100 seconds", () => {
      adapter = new Adapter({ ttl: 100 });
      const current = adapter._getTimeFraction();
      jest.advanceTimersByTime(10 * 1000);
      const next = adapter._getTimeFraction();
      expect(current + 1).toEqual(next);
    });

    it("should change time every 2h and 24min by default", () => {
      const current = adapter._getTimeFraction();
      jest.advanceTimersByTime((2 * 60 + 24) * 60 * 1000);
      const next = adapter._getTimeFraction();
      expect(current + 1).toEqual(next);
    });
  });
});
