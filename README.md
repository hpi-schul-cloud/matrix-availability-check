# Matrix Availability Check

The matrix messenger setup is composed of multiple service which have to work hand in hand to run successful.
This script performs different calls to check that the features work as expected.


## Configuration

Copy the `instances.sample.json` file to `instances.json` and specify the matrix instances you want to check.

```
[
  {
    "name": "Niedersachsen",
    "key": "niedersachsen",
    "sharedSecret": "XXX",
    "alternativeDomain": "https://niedersachsen.cloud",
    "host": "11.22.33.44",
    "privateKey": "..."
  }
]
```


## Usage

Execute the following command to check if all configured instances are available:
```
npm run start
```

To check only specific instances you can add the configured instant keys:
```
npm run start KEY1 KEY2
```

Until stopped the script checks every minute if the services are still available.

Output:
```
┌─────────┬─────────────────┬────────────────┬──────────────┬──────────────┬─────────────┬──────┬────────────┬────────────────────────────┐
│ (index) │ embedAccessible │ syncConnection │ createdRooms │ createdUsers │ corsHeaders │ ssh  │ hydraAlive │           oauth            │
├─────────┼─────────────────┼────────────────┼──────────────┼──────────────┼─────────────┼──────┼────────────┼────────────────────────────┤
│  host   │      true       │      true      │     2000     │     1000     │   '8 / 8'   │ true │    true    │ 'https://domain.tld/login' │
└─────────┴─────────────────┴────────────────┴──────────────┴──────────────┴─────────────┴──────┴────────────┴────────────────────────────┘
```
