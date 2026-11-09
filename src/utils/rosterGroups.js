export function groupRosterPlayers(players, groups) {
  const grouped = groups.map((group) => ({ ...group,
    players: players.filter((player) => group.positions.includes(player.position)),
  }));
  const assigned = new Set(grouped.flatMap((group) => group.players.map((player) => player.id)));
  return [...grouped, { title: 'Sin posición definida',
    players: players.filter((player) => !assigned.has(player.id)),
  }];
}
