async function test() {
  const res = await fetch('https://app.apidevoos.dev/api/v1/flights/search', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer mbx_live_b174920a240daa41c10c8b68e3fc384e418ac920bac3501b4fdfda3f3b780f49',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      type: 'one_way',
      slices: [
        {
          origin: 'GRU',
          destination: 'CWB',
          departureDate: '2026-06-01'
        }
      ],
      passengers: [
        { type: 'adult', count: 1 }
      ],
      cabinClass: 'economy',
      maxConnections: 2,
      suppliers: ["latam", "gol", "azul"],
      enableDeduplication: true,
      searchType: "pagante"
    })
  });

  console.log('STATUS:', res.status);
  const text = await res.text();
  console.log('BODY:', text);
}

test();
