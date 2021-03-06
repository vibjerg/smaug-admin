/**
 * @file
 *
 * Produce stats for one or more endpoints, using aggregations:
 * https://www.elastic.co/guide/en/elasticsearch/reference/current/search-aggregations.html
 * https://www.elastic.co/guide/en/elasticsearch/reference/current/search-aggregations-bucket-terms-aggregation.html
 *
 * -f (filter) is used to select the application and log-level
 * -e (endpoint) is used to specify the field containing the endpoint(s) and the endpoint(s) to extract stats from
 *
 */

const getopts = require('getopts');
const fs = require('fs');
const ElasticSearch = require('elasticsearch');

const hourSum = {
  "date_histogram": {
    "field": "timestamp",
    "calendar_interval": "1h",
    "time_zone": "Europe/Copenhagen",
    "min_doc_count": 0
  }
}
const daySum = {
  "date_histogram": {
    "field": "timestamp",
    "calendar_interval": "1d",
    "time_zone": "Europe/Copenhagen",
    "min_doc_count": 0
  }
}
const search = {
  size: 0,
  body: {
    "query": {bool: { filter: {}}},
    "aggs": {"hoursum": hourSum, "daysum": daySum}
  }
}
const now = new Date();

/* -- main ----------------------------------------------------------------------------------- */

const [host, filters, endpoints, clientFile, outfile, monthly] = getFileInfoOrDie(process.argv.slice(2));
try {
  oFilters = JSON.parse(filters);
} catch (e) {
  usage('filter(s) should be valid json\n - ' + filters + '\n - ' + e.message);
}
try {
  oEndpoints = JSON.parse(endpoints);
} catch (e) {
  usage('endpoint(s) should be valid json\n - ' + endpoints + '\n - ' + e.message);
}
console.log('Start at', now);
const clientList = fetchClientIds(clientFile);
client = new ElasticSearch.Client({host: host});

if (monthly) {
  console.log('Get monthly stats');
  search.body.query.bool.filter = setQueryFilter(oFilters, now.toISOString().slice(0,8) + '01', now.toISOString().slice(0,10));
}
else {
  console.log('Get last 30 days');
  search.body.query.bool.filter = setQueryFilter(oFilters, "2000-01-01", "9999-12-31");
}
console.log('Search:', JSON.stringify(search, null, 2));
elkSearch(search, oEndpoints).then(function(resp){
  const res = Object.assign({created: now}, {filter: oFilters}, {clientList: resp});
  writeFile(outfile, JSON.stringify(res, null, 2));
  console.log('Exit at', new Date());
});

/* -- private ----------------------------------------------------------------------------------- */
/**
 * Loop endpoint(s) and collect stats for each of them
 *
 * @param search
 * @param endpoints
 * @returns {Promise<{}>}
 */
async function elkSearch (search, endpoints) {
  const resp = {};
  for (const clientIdx in clientList) {
    const clientId = clientList[clientIdx];
    console.log('clientId', clientId);
    resp[clientId] = {};
    for (const field in endpoints) {
      for (const ep in endpoints[field]) {
        const endpoint = endpoints[field][ep];
        resp[clientId][endpoint] = {};
        let thisSearch = JSON.parse(JSON.stringify(search));
        thisSearch.body.query.bool.filter.push({"match_phrase": {clientId: clientId}});
        thisSearch.body.query.bool.filter.push({"match_phrase": {[field]: endpoint}});
        const elkResponse = await client.search(thisSearch);
        Object.keys(elkResponse.aggregations).forEach(sum => {
          const zums = parseAggr(elkResponse.aggregations[sum]);
          if (zums.length) {
            resp[clientId][endpoint][sum] = zums;
          }
        })
      }
    }
  }
  return resp;
}

/**
 *
 * @param aggr
 * @returns {[]}
 */
function parseAggr(aggr) {
  const res = [];
  aggr.buckets.forEach(obj => {
    date = new Date(obj.key_as_string);
    res.push({date: date.toISOString(), count: obj.doc_count});
  });
  return res;
}

/**
 *
 * @param filters
 * @param from
 * @param to
 * @returns {[]}
 */
function setQueryFilter(filters, from, to) {
  const filter = [];
  filter.push({range: {timestamp:{gte:from, lte:to, format:"strict_date_optional_time"}}});
  Object.keys(filters).forEach(val => {
    filter.push({match_phrase:{[val]:filters[val]}})
  })
  return filter;
}

/**
 *
 * @param fileName
 * @param buffer
 */
function writeFile(fileName, buffer) {
  try {
    return fs.writeFileSync(fileName, buffer);
  } catch (err) {
    usage('Cannot write ' + fileName);
  }
}

function fetchClientIds(clientFile) {
  const list = [];
  try {
    const clients = fs.readFileSync(clientFile);
    JSON.parse(clients).forEach(client => {
      list.push(client.id);
    });
  } catch (err) {
    usage('Cannot read ' + clientFile);
  }
  return list;
}
/**
 *
 * @param args
 * @returns {any[]}
 */
function getFileInfoOrDie(args) {
  const options = getopts(args, {
    alias: {
      endpoint: 'e',
      filter: 'f',
      host: 'h',
      output: 'o',
      monthly: 'm'
    }
  });
  if (!options['h']) {
    usage('missing host');
  }
  if (!options['o']) {
    usage('missing fileinfo');
  }
  if (!options['f']) {
    usage('missing filter(s)');
  }
  if (!options['c']) {
    usage('missing json client-list');
  }
  if (!options['e']) {
    usage('missing endpoint(s)');
  }
  return [options['h'], options['f'], options['e'], options['c'], options['o'], options['m']];
}

/**
 *
 * @param error
 */
function usage(error) {
  const scriptName = __filename.split(/[\\/]/).pop();
  const errorTxt = error ? '\nError: ' + error + '\n\n' : '';
  console.log(
    'Create a json file with day and hours sums for last 30-ish days.\n' +
    'Option -m will only produce sums for the current month (normally used on the last day of each month)' +
    '\n%sUsage \n %s [options]\n\n' +
    'Options:\n' +
    ' -h [ElasticSearch host] -f [filter(s)] -e [endpoint(s)] -c client-list -o output [json-file] -m\n' +
    '\nExample:\n' +
    scriptName + ' -h http://elk.dk -f \'{"app": "my_app", "level": "INFO"}\' -e \'{"endpointName": ["endp-1", endp-2"]}\' -o myFile.json',errorTxt, scriptName);
  process.exit(1);
}

