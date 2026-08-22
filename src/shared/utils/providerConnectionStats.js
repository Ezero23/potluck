export function providerConnectionsForStats(connections, providerId) {
  if (!Array.isArray(connections)) return [];
  return connections.filter((connection) => connection?.provider === providerId);
}

export function isProviderConnection(connection, providerId) {
  return connection?.provider === providerId;
}
