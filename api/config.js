module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60');
  return res.status(200).json({
    trafficEnabled: Boolean(process.env.TOMTOM_API_KEY),
    trafficProvider: 'TomTom Orbis Traffic Flow v2',
    trafficRefreshSeconds: 90,
    parkingSource: 'OpenStreetMap / Overpass',
    liveParkingAvailability: false,
    routeTrafficAware: false
  });
};
