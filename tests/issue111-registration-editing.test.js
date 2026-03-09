/**
 * Regression tests for issue #111 registration editing flow.
 */

globalThis.window = globalThis;
globalThis.module = undefined;
window.debugLogger = { debug: () => {} };

await import('../modules/race.js');
await import('../modules/registration.js');

const RaceManager = window.RaceManager;
const RegistrationManager = window.RegistrationManager;

describe('Issue #111 regressions', () => {
    beforeEach(() => {
        window.ClassResolver = {
            getEnabledEventClasses: () => [
                { id: 'pro', name: 'Pro', classId: 'pro', className: 'Pro', enabled: true },
                { id: 'sport', name: 'Sport', classId: 'sport', className: 'Sport', enabled: true }
            ]
        };
    });

    it('uses eventClasses mapping even when event id key types differ', () => {
        const raceManager = new RaceManager({}, { getNextRaceNumber: () => 1, setNextRaceNumber: () => {} });
        const participants = [
            {
                id: 'driver-1',
                name: 'Driver One',
                eventClasses: { 101: ['pro'] },
                selectedClasses: ['sport']
            }
        ];
        const event = { id: '101', seriesId: 'series-1' };

        const grouped = raceManager.groupParticipantsByClass(participants, event);

        expect(grouped.Pro).toBeDefined();
        expect(grouped.Pro).toHaveLength(1);
        expect(grouped.Pro[0].id).toBe('driver-1');
        expect(grouped.Sport || []).toHaveLength(0);
    });

    it('updates event-specific classes in edit mode without overwriting other events', async () => {
        const manager = Object.create(RegistrationManager.prototype);
        manager.loadParticipantList = vi.fn();

        const updateParticipant = vi.fn().mockResolvedValue({});
        globalThis.dataManager = { updateParticipant };
        globalThis.Helpers = {
            showToast: vi.fn(),
            hideModal: vi.fn()
        };

        const form = document.createElement('form');
        form.innerHTML = `
            <input name="participantName" value="Driver One" />
            <input name="participantId" value="driver-1" />
            <input name="eventId" value="event-1" />
            <input type="checkbox" name="sledClasses" value="pro" checked />
        `;

        await manager.handleUnifiedFormSubmit(
            { preventDefault: () => {}, target: form },
            'edit',
            {
                id: 'driver-1',
                eventClasses: { 'event-2': ['sport'] }
            }
        );

        expect(updateParticipant).toHaveBeenCalledTimes(1);
        const [participantId, updates] = updateParticipant.mock.calls[0];
        expect(participantId).toBe('driver-1');
        expect(updates.eventClasses).toEqual({
            'event-2': ['sport'],
            'event-1': ['pro']
        });
        expect(updates.selectedClasses).toEqual(expect.arrayContaining(['sport', 'pro']));
    });
});
