const axios = require('axios');

async function test() {
  const rapidApiKey = '21d1f3e496msh0e4b7a42d9dc8d7p1f4aeejsnfa6f3645d1c2';
  const rapidApiHost = 'google-flights2.p.rapidapi.com';

  const date = new Date();
  date.setDate(date.getDate() + 14);
  const dateStr = date.toISOString().split('T')[0];

  const options = {
    method: 'GET',
    url: `https://${rapidApiHost}/api/v1/searchFlights`,
    params: {
      departure_id: 'SSA',
      arrival_id: 'CNF',
      outbound_date: '2026-05-25',
      currency: 'BRL',
      travel_class: 'ECONOMY',
      adults: '1',
      show_hidden: '1',
      language_code: 'pt-BR',
      country_code: 'BR',
      search_type: 'best',
    },
    headers: {
      'x-rapidapi-key': rapidApiKey,
      'x-rapidapi-host': rapidApiHost
    }
  };

  try {
    const res = await axios.request(options);
    console.log('Status:', res.status);
    console.log('Data Keys:', Object.keys(res.data));
    if (res.data.data) {
      console.log('Data Data Keys:', Object.keys(res.data.data));
      if (res.data.data.itineraries) {
        console.log('Itineraries Keys:', Object.keys(res.data.data.itineraries));
        const top = res.data.data.itineraries.topFlights || [];
        console.log('Top Flights Count:', top.length);
        if (top.length > 0) {
          console.log('First Top Flight Price:', top[0].price);
          console.log('First Top Flight Structure:', JSON.stringify(top[0], null, 2).substring(0, 500));
        }
      }
      if (res.data.data.bestFlights) {
        console.log('Best Flights Count:', res.data.data.bestFlights.length);
      }
    }
  } catch (error) {
    console.error('Error:', error.message);
    if (error.response) console.error('Response Data:', error.response.data);
  }
}

test();
