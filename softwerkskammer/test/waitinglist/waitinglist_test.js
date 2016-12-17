'use strict';

const request = require('supertest');
const sinon = require('sinon').sandbox.create();

const beans = require('../../testutil/configureForTest').get('beans');

const Activity = beans.get('activity');
const activitiesService = beans.get('activitiesService');
const waitinglistService = beans.get('waitinglistService');

const app = require('../../testutil/testHelper')('waitinglistApp').createApp({id: 'superuser'});

describe('Waitinglist application', () => {

  beforeEach(() => {
    sinon.stub(activitiesService, 'getActivityWithGroupAndParticipants', (url, callback) => {
      callback(null, new Activity({url, title: 'Activity\'s Title'}));
    });
    sinon.stub(waitinglistService, 'waitinglistFor', (url, callback) => {
      callback(null, []);
    });
  });

  afterEach(() => {
    sinon.restore();
  });

  it('shows the waitinglist as retrieved from the store', done => {
    request(app)
      .get('/activity')
      .expect(200)
      .expect(/<h2>Activity\'s Title/)
      .expect(/<small> Warteliste/)
      .expect(/activities\/activity/)
      .expect(/Für die gewählten Wartelisteneinträge /).expect(/title/, done);
  });

});
