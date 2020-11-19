const axios_constructor = require("axios");
const hmacSHA512 = require("crypto-js/hmac-sha512");
const { NodeSSH } = require("node-ssh");

const instances = require("./instances.json");

const TIMEOUT = 100 * 20 * 1000;
const FREQUENCY = 60 * 1000;

const axios_timeout = axios_constructor.create({
  timeout: TIMEOUT,
});

const axios = {
  get: (url, options) => {
    const abort = axios_constructor.CancelToken.source();
    const id = setTimeout(
      () => abort.cancel(`Timeout of ${TIMEOUT}ms.`),
      TIMEOUT
    );

    return axios_timeout
      .get(url, { cancelToken: abort.token, ...options })
      .then((response) => {
        clearTimeout(id);
        return response;
      });
  },
  post: (url, body, options) => {
    const abort = axios_constructor.CancelToken.source();
    const id = setTimeout(
      () => abort.cancel(`Timeout of ${TIMEOUT}ms.`),
      TIMEOUT
    );

    return axios_timeout
      .post(url, body, { cancelToken: abort.token, ...options })
      .then((response) => {
        clearTimeout(id);
        return response;
      });
  },
};

function obtain_access_token(user_id, homeserver_api_url, shared_secret) {
  const login_api_url = homeserver_api_url + "/_matrix/client/r0/login";

  const password = hmacSHA512(user_id, shared_secret).toString();

  const payload = {
    type: "m.login.password",
    user: user_id,
    password: password,
  };

  return axios.post(login_api_url, payload).then((response) => {
    const session = {
      userId: user_id,
      homeserverUrl: homeserver_api_url,
      accessToken: response.data.access_token,
    };
    return session;
  });
}

async function testSynapse(instance) {
  const result = {};
  const domain = instance.baseDomain || `${instance.key}.messenger.schule`;
  if (!instance.accessToken) {
    await obtain_access_token(
      `@sync:${domain}`,
      `https://matrix.${domain}`,
      instance.sharedSecret
    )
      .then((res) => {
        instance.accessToken = res.accessToken;
        result.syncConnection = true;
      })
      .catch((err) => {
        console.error(err);
        result.syncConnection = false;
      });
  }

  if (instance.accessToken) {
    await axios
      .get(`https://matrix.${domain}/_synapse/admin/v1/rooms`, {
        headers: { Authorization: `Bearer ${instance.accessToken}` },
      })
      .then((res) => {
        result.createdRooms = res.data.total_rooms;
        result.syncConnection = true;
      })
      .catch((err) => {
        console.error(err);
        result.createdRooms = "FAILED";
      });

    await axios
      .get(`https://matrix.${domain}/_synapse/admin/v2/users`, {
        headers: { Authorization: `Bearer ${instance.accessToken}` },
      })
      .then((res) => {
        result.createdUsers = res.data.total || res.data.users.length;
        result.syncConnection = true;
      })
      .catch(() => {
        result.createdUsers = "FAILED";
      });
  }

  return result;
}

async function testEmbed(instance) {
  const result = {};

  await axios
    .get(`https://embed.${instance.key}.messenger.schule/embed.js`)
    .then((res) => {
      result.embedAccessible = true;
    })
    .catch(() => {
      result.embedAccessible = false;
    });

  return result;
}

async function testCors(instance) {
  const result = {};
  let domain = instance.alternativeDomain
    ? `https://${instance.alternativeDomain}`
    : `https://${instance.key}.hpi-schul-cloud.org`;
  await axios
    .get(domain)
    .then((res) => {
      const cors = res.headers["content-security-policy"];
      let foundHeaders = 0;
      foundHeaders += (
        cors.match(
          new RegExp(`https:\/\/${instance.key}.messenger.schule`, "g")
        ) || []
      ).length;
      foundHeaders += (
        cors.match(
          new RegExp(`https:\/\/embed.${instance.key}.messenger.schule`, "g")
        ) || []
      ).length;
      foundHeaders += (
        cors.match(
          new RegExp(`https:\/\/matrix.${instance.key}.messenger.schule`, "g")
        ) || []
      ).length;
      result.corsHeaders = `${foundHeaders} / 8`;
    })
    .catch((err) => {
      result.corsHeaders = `FAILED`;
    });

  return result;
}

async function testHydra(instance) {
  const result = {};
  let domain = instance.alternativeDomain
    ? `https://oauth.${instance.alternativeDomain}`
    : `https://oauth.${instance.key}.hpi-schul-cloud.org`;
  await axios
    .get(domain + "/health/alive")
    .then((res) => {
      result.hydraAlive = res.data.status === "ok";
    })
    .catch((err) => {
      result.hydraAlive = `FAILED`;
    });

  await axios
    .get(
      `https://matrix.${instance.key}.messenger.schule/_matrix/client/r0/login/sso/redirect?redirectUrl=https%3A%2F%2Fapp.element.io%2F%23%2F`
    )
    .then((res) => {
      result.oauth = res.request._redirectable._currentUrl;
    })
    .catch((err) => {
      if (
        err.response &&
        JSON.stringify(err.response.data) ===
          JSON.stringify({
            errcode: "M_UNRECOGNIZED",
            error: "Unrecognized request",
          })
      ) {
        result.oauth = "DISABLED";
      } else {
        result.oauth = "FAILED";
      }
    });

  return result;
}

async function testSSH(instance) {
  const result = {};

  ssh = new NodeSSH();
  await ssh
    .connect({
      host: instance.host || `https://${instance.key}.messenger.schule`,
      username: instance.user || "root",
      privateKey: instance.privateKey,
    })
    .then(() => {
      result.ssh = true;
    })
    .catch((err) => {
      result.ssh = false;
    });

  return result;
}

async function checkInstances() {
  let instancesToCheck = instances;

  // filer instances if names where passed as arguments
  if (process.argv.length > 2) {
    const instantKeys = process.argv.slice(2);
    instancesToCheck = instancesToCheck.filter((instance) => {
      return (
        instantKeys.includes(instance.key) ||
        instantKeys.includes(instance.name)
      );
    });
  }

  // init
  const result = {};
  for (const instance of instancesToCheck) {
    result[instance.key] = {
      //instance: instance.name,
      embedAccessible: "N/A",
      syncConnection: "N/A",
      createdRooms: "N/A",
      createdUsers: "N/A",
      corsHeaders: "N/A",
    };
  }

  // checks
  const checks = [testSynapse, testEmbed, testCors, testHydra, testSSH];
  const promises = [];
  for (const instance of instancesToCheck) {
    for (const check of checks) {
      promises.push(
        check(instance).then((res) => {
          result[instance.key] = Object.assign(result[instance.key], res);
        })
      );
    }
  }

  await Promise.all(promises);
  return result;
}

function printCheck(results) {
  console.log(new Date());
  console.table(results);
}

function start() {
  checkInstances().then(printCheck);

  setInterval(() => {
    checkInstances().then(printCheck);
  }, FREQUENCY);
}

start();
