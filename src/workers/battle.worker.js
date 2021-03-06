/* eslint-disable no-await-in-loop */

const db = require('../models/index.js');
const battleLoggerPkg = require('../logs/battle.log.js');

const Army = db.armies;
const Battle = db.battles;

// notes:
// maybe adding redis to track state and at the end sync it with mysql

const getSelectedArmy = (armies, attackerId, strategy) => {
	const availableArmies = armies.filter((army) => army.id !== attackerId && army.units > 0);

	if (!availableArmies.length) {
		return null;
	}

	if (availableArmies.length === 1) {
		return availableArmies[0];
	}

	let army;

	if (strategy === 'random') {
		const randomIndex = Math.floor(Math.random() * availableArmies.length);
		army = availableArmies[randomIndex];
	} else if (strategy === 'strongest') {
		let strongest = availableArmies[0];
		for (let i = 1; i < availableArmies.length; i += 1) {
			if (strongest.units < availableArmies[i].units) {
				strongest = availableArmies[i];
			}
		}
		army = strongest;
	} else if (strategy === 'weakest') {
		let weakest = availableArmies[0];
		for (let i = 1; i < availableArmies.length; i += 1) {
			if (weakest.units > availableArmies[i].units) {
				weakest = availableArmies[i];
			}
		}
		army = weakest;
	}

	return army;
};

const randomNumGenerator = (min = 1, max = 100) => Math.floor(Math.random() * (max - min + 1) + min);

const attackChances = (units) => {
	const randomNum = randomNumGenerator();

	if (units < 10) {
		if (randomNum < 10) {
			return true;
		}
		return false;
	}

	if (randomNum < units) {
		return true;
	}
	return false;
};

const chooseAttackingArmy = (armies) => Math.floor(Math.random() * armies.length);

const startBattle = async (job) => {
	const { armies } = job.data;
	const { battleId } = armies[0];
	const battleLogger = battleLoggerPkg(`battle-${battleId}.txt`);

	let winner = false;
	let counter = 0;

	while (winner === false) {
		for (let i = 0; i < armies.length; i += 1) {
			counter += 1;
			const battle = await Battle.findOne({
				where: { id: armies[i].battleId },
			});

			if (battle.status === 'paused') break;

			const randomAttackingArmyIndex = chooseAttackingArmy(armies);
			const attackingArmy = armies[randomAttackingArmyIndex];

			if (attackingArmy.units > 0) {
				const defendingArmy = getSelectedArmy(armies, attackingArmy.id, attackingArmy.strategy);

				if (defendingArmy === null) {
					winner = attackingArmy;

					battleLogger.info('Battle progress', {
						logId: counter,
						battleId,
						winner: `${winner.name} with ${winner.units} units left is winner!!`,
					});
					break;
				}

				const attackSuccess = attackChances(attackingArmy.units);

				battleLogger.info('Battle progress', {
					logId: counter,
					battleId,
					attackSuccess,
					attackingArmyName: attackingArmy.name,
					attackingArmyUnits: attackingArmy.units,
					defendingArmyName: defendingArmy ? defendingArmy.name : '',
					defendingArmyUnits: defendingArmy ? defendingArmy.units : '',
				});

				if (attackSuccess) {
					let damage = 0.5;

					if (defendingArmy.units <= 1) damage = 1;

					defendingArmy.units -= damage;

					await Army.update({ units: defendingArmy.units }, { where: { id: defendingArmy.id } });
					// console.log(armies);
				}
			}
		}
	}

	await Battle.update({ status: 'finished', winner: winner.name }, { where: { id: battleId } });

	await Army.update({ winner: true }, { where: { id: winner.id } });

	return Promise.resolve(winner);
};

module.exports = startBattle;
