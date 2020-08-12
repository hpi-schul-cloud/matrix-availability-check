const axios_constructor = require('axios');
const hmacSHA512 = require('crypto-js/hmac-sha512');

const instances = require('./instances.json');

const TIMEOUT = 2000;

const axios_timeout = axios_constructor.create({
  timeout: TIMEOUT,
});

const axios = {
  get: (url, options) => {
    const abort = axios_constructor.CancelToken.source()
    const id = setTimeout(
      () => abort.cancel(`Timeout of ${TIMEOUT}ms.`),
      TIMEOUT
    );

    return axios_timeout
      .get(url, { cancelToken: abort.token, ...options })
      .then(response => {
        clearTimeout(id);
        return response;
      });
  },
  post: (url, body, options) => {
    const abort = axios_constructor.CancelToken.source()
    const id = setTimeout(
      () => abort.cancel(`Timeout of ${TIMEOUT}ms.`),
      TIMEOUT
    );

    return axios_timeout
      .post(url, body, { cancelToken: abort.token, ...options })
      .then(response => {
        clearTimeout(id);
        return response;
      });
  },
};


function obtain_access_token(user_id, homeserver_api_url, shared_secret) {
    const login_api_url = homeserver_api_url + '/_matrix/client/r0/login'

    const password = hmacSHA512(user_id, shared_secret).toString();

    const payload = {
        'type': 'm.login.password',
        'user': user_id,
        'password': password,
    }

    return axios.post(login_api_url, payload)
      .then(response => {
        const session = {
          userId: user_id,
          homeserverUrl: homeserver_api_url,
          accessToken: response.data.access_token,
        }
        return session
      })
}

async function testSynapse(instance) {
  let accessToken = null;
  const result = {};
  await obtain_access_token(`@sync:${instance.key}.messenger.schule`, `https://matrix.${instance.key}.messenger.schule`, instance.sharedSecret)
    .then((res) => {
      accessToken = res.accessToken;
      result.syncConnection = true;
    })
    .catch(() => {
      result.syncConnection = false;
    });

  if (accessToken) {
    await axios.get(`https://matrix.${instance.key}.messenger.schule/_synapse/admin/v1/rooms`, { headers: { Authorization: `Bearer ${accessToken}` } })
      .then((res) => {
        result.createdRooms = res.data.total_rooms;
      })
      .catch(() => {
        result.createdRooms = 'FAILED';
      });

    await axios.get(`https://matrix.${instance.key}.messenger.schule/_synapse/admin/v2/users`, { headers: { Authorization: `Bearer ${accessToken}` } })
      .then((res) => {
        result.createdUsers = res.data.total;
      })
      .catch(() => {
        result.createdUsers = 'FAILED';
      });
  }

  return result;
}

async function testEmbed(instance) {
  const result = {};

  await axios.get(`https://embed.${instance.key}.messenger.schule/embed.js`)
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
  let domain = instance.alternativeDomain || `https://${instance.key}.schul-cloud.org`
  await axios.get(domain)
    .then((res) => {
      const cors = res.headers['content-security-policy'];
      let foundHeaders = 0;
      foundHeaders += (cors.match(new RegExp(`https:\/\/${instance.key}.messenger.schule`, 'g')) || []).length;
      foundHeaders += (cors.match(new RegExp(`https:\/\/embed.${instance.key}.messenger.schule`, 'g')) || []).length;
      foundHeaders += (cors.match(new RegExp(`https:\/\/matrix.${instance.key}.messenger.schule`, 'g')) || []).length;
      result.corsHeaders = `${foundHeaders} / 6`;
    })
    .catch((err) => {
      result.corsHeaders = `FAILED`;
    });

  return result;
}

async function checkInstances() {
  // init
  const result = {};
  for (const instance of instances) {
    result[instance.key] = {
      //instance: instance.name,
      embedAccessible: 'N/A',
      syncConnection: 'N/A',
      createdRooms: 'N/A',
      createdUsers: 'N/A',
      corsHeaders: 'N/A'
    };
  };

  // checks
  const promises = [];
  for (const instance of instances) {
    promises.push(
      testSynapse(instance).then((res) => {
        result[instance.key] = Object.assign(result[instance.key], res)
      })
    );
    promises.push(
      testEmbed(instance).then((res) => {
        result[instance.key] = Object.assign(result[instance.key], res)
      })
    );
    promises.push(
      testCors(instance).then((res) => {
        result[instance.key] = Object.assign(result[instance.key], res)
      })
    );
  }

  await Promise.all(promises);
  return result;
}

checkInstances().then(console.table);