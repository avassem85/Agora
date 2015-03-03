'use strict';

var request = require('supertest');
var sinon = require('sinon').sandbox.create();
var expect = require('must');

var beans = require('../../testutil/configureForTest').get('beans');
var userWithoutMember = require('../../testutil/userWithoutMember');
var membersService = beans.get('membersService');
var memberstore = beans.get('memberstore');
var subscriberstore = beans.get('subscriberstore');
var socratesNotifications = beans.get('socratesNotifications');
var groupsAndMembersService = beans.get('groupsAndMembersService');
var Member = beans.get('member');
var Subscriber = beans.get('subscriber');

var createApp = require('../../testutil/testHelper')('socratesMembersApp').createApp;

describe('SoCraTes members application', function () {
  var appWithoutMember;
  var appWithSoftwerkskammerMember;
  var appWithSocratesMember;
  var softwerkskammerMember;
  var socratesMember;
  var softwerkskammerSubscriber;
  var socratesSubscriber;

  before(function () {
    softwerkskammerMember = new Member({
      id: 'memberId',
      nickname: 'hada',
      email: 'a@b.c',
      site: 'http://my.blog',
      firstname: 'Hans',
      lastname: 'Dampf',
      authentications: [],
      socratesOnly: false
    });
    softwerkskammerSubscriber = new Subscriber({id: 'memberId'});

    socratesMember = new Member({
      id: 'memberId2',
      nickname: 'nini',
      email: 'x@y.com',
      site: 'http://my.blog',
      firstname: 'Petra',
      lastname: 'Meier',
      authentications: [],
      socratesOnly: true
    });
    socratesSubscriber = new Subscriber({id: 'memberId2'});

    appWithoutMember = request(createApp({middlewares: [userWithoutMember]}));
    appWithSoftwerkskammerMember = request(createApp({member: softwerkskammerMember}));
    appWithSocratesMember = request(createApp({member: socratesMember}));
  });

  afterEach(function () {
    sinon.restore();
  });

  describe('accessing a member page', function () {

    it('gives a 404 if there is no matching member in the database', function (done) {
      sinon.stub(memberstore, 'getMember', function (nickname, callback) { callback(null); });

      appWithSoftwerkskammerMember
        .get('/hada')
        .expect(404, done);
    });

    it('gives a 404 if there is a member but no matching subscriber in the database', function (done) {
      sinon.stub(memberstore, 'getMember', function (nickname, callback) { callback(null, softwerkskammerMember); });
      sinon.stub(subscriberstore, 'getSubscriber', function (nickname, callback) { callback(null); });

      appWithSoftwerkskammerMember
        .get('/hada')
        .expect(404, done);
    });

    it('shows the subscriber\'s own page', function (done) {
      sinon.stub(memberstore, 'getMember', function (nickname, callback) { callback(null, softwerkskammerMember); });
      sinon.stub(subscriberstore, 'getSubscriber', function (nickname, callback) { callback(null, softwerkskammerSubscriber); });

      appWithSoftwerkskammerMember
        .get('/hada')
        .expect(200)
        .expect(/First name:<\/strong> Hans/)
        .expect(/Last name:<\/strong> Dampf/, done);
    });

    it('shows a different subscriber\'s page', function (done) {
      sinon.stub(memberstore, 'getMember', function (nickname, callback) { callback(null, socratesMember); });
      sinon.stub(subscriberstore, 'getSubscriber', function (nickname, callback) { callback(null, socratesSubscriber); });

      appWithSoftwerkskammerMember
        .get('/nini')
        .expect(200)
        .expect(/First name:<\/strong> Petra/)
        .expect(/Last name:<\/strong> Meier/, done);
    });

  });

  describe('editing a member page', function () {

    it('allows somebody who is neither member nor subscriber to create his account', function (done) {
      appWithoutMember
        .get('/edit')
        .expect(200)
        .expect(/In order to keep you informed about the SoCraTes conference, we need you to provide us with the following information\. Please fill in all mandatory fields\./, done);
    });

    it('allows a SoCraTes-only member to edit his page', function (done) {
      appWithSocratesMember
        .get('/edit')
        .expect(200)
        .expect(/Here you can edit your information\./, done);
    });

    it('allows a Softwerkskammer member to edit his page', function (done) {
      appWithSoftwerkskammerMember
        .get('/edit')
        .expect(200)
        .expect(/Here you find the information from your Softwerkskammer account that is used by SoCraTes\./, done);
    });

  });

  describe('submitting a member form', function () {

    it('rejects a member with invalid and different nickname on submit', function (done) {
      sinon.stub(membersService, 'isValidNickname', function (nickname, callback) {
        callback(null, false);
      });

      appWithSoftwerkskammerMember
        .post('/submit')
        .send('id=0815&firstname=A&lastname=B&email=c@d.de&previousEmail=c@d.de')
        .send('nickname=nickerinack')
        .send('previousNickname=bibabu')
        .expect(200)
        .expect(/Failed/)
        .expect(/Validation/)
        .expect(/This nickname is not available\./, done);
    });

    it('rejects a member with invalid and different email address on submit', function (done) {
      sinon.stub(membersService, 'isValidEmail', function (nickname, callback) {
        callback(null, false);
      });

      appWithSoftwerkskammerMember
        .post('/submit')
        .send('id=0815&firstname=Hans&lastname=Dampf&nickname=hada&previousNickname=hada')
        .send('email=here@there.org')
        .send('previousEmail=there@wherever.com')
        .expect(200)
        .expect(/Failed/)
        .expect(/Validation/)
        .expect(/This e-mail address is already registered\./, done);
    });

    it('rejects a member with missing first and last name on submit', function (done) {
      appWithSoftwerkskammerMember
        .post('/submit')
        .send('id=0815&&nickname=hada&previousNickname=hada&email=here@there.org&previousEmail=here@there.org')
        .expect(200)
        .expect(/Failed/)
        .expect(/Validation/)
        .expect(/First name is required\./)
        .expect(/Last name is required\./, done);
    });

    it('rejects a member with missing first name who validly changed their nickname and mailaddress on submit', function (done) {
      // attention: This combination is required to prove the invocations of the callbacks in case of no error!
      sinon.stub(membersService, 'isValidNickname', function (nickname, callback) {
        callback(null, true);
      });
      sinon.stub(membersService, 'isValidEmail', function (nickname, callback) {
        callback(null, true);
      });

      appWithSoftwerkskammerMember
        .post('/submit')
        .send('id=0815&&nickname=hadaNew&previousNickname=hada&lastname=x&email=hereNew@there.org&previousEmail=here@there.org')
        .expect(200)
        .expect(/Failed/)
        .expect(/Validation/)
        .expect(/First name is required\./, done);
    });

    it('rejects a member with invalid nickname and email address on submit, giving two error messages', function (done) {
      sinon.stub(membersService, 'isValidNickname', function (nickname, callback) {
        callback(null, false);
      });
      sinon.stub(membersService, 'isValidEmail', function (nickname, callback) {
        callback(null, false);
      });

      appWithSoftwerkskammerMember
        .post('/submit')
        .send('id=0815&firstname=A&lastname=B')
        .send('nickname=nickerinack')
        .send('previousNickname=hada')
        .send('email=here@there.org')
        .send('previousEmail=there@wherever.com')
        .expect(200)
        .expect(/Failed/)
        .expect(/Validation/)
        .expect(/This nickname is not available\./)
        .expect(/This e-mail address is already registered\./, done);
    });

    it('saves an existing Softwerkskammer member, creates a subscriber because it is not yet there, and does not trigger notification sending', function (done) {
      sinon.stub(membersService, 'isValidNickname', function (nickname, callback) { callback(null, true); });
      sinon.stub(membersService, 'isValidEmail', function (nickname, callback) { callback(null, true); });
      sinon.stub(memberstore, 'saveMember', function (member, callback) { callback(null); });
      var subscriberSave = sinon.stub(subscriberstore, 'saveSubscriber', function (subscriber, callback) { callback(null); });
      var notificationCall = sinon.stub(socratesNotifications, 'newSoCraTesMemberRegistered', function () { return undefined; });

      // the following stub indicates that the member already exists
      sinon.stub(groupsAndMembersService, 'getMemberWithHisGroups', function (nickname, callback) { callback(null, softwerkskammerMember); });
      // and that the subscriber is not yet there
      sinon.stub(subscriberstore, 'getSubscriber', function (id, callback) { callback(null); });
      appWithSoftwerkskammerMember
        .post('/submit')
        .send('id=0815&firstname=A&lastname=B')
        .send('nickname=nickerinack')
        .send('email=here@there.org')
        .expect(302)
        .expect('location', '/', function (err) {
          expect(subscriberSave.called).to.be(true);
          expect(notificationCall.called).to.be(false);
          done(err);
        });
    });

    it('saves an existing SoCraTes member, creates no subscriber because it is already there, and does not trigger notification sending', function (done) {
      sinon.stub(membersService, 'isValidNickname', function (nickname, callback) { callback(null, true); });
      sinon.stub(membersService, 'isValidEmail', function (nickname, callback) { callback(null, true); });
      sinon.stub(memberstore, 'saveMember', function (member, callback) { callback(null); });
      var subscriberSave = sinon.stub(subscriberstore, 'saveSubscriber', function (subscriber, callback) { callback(null); });
      var notificationCall = sinon.stub(socratesNotifications, 'newSoCraTesMemberRegistered', function () { return undefined; });

      // the following stub indicates that the member already exists
      sinon.stub(groupsAndMembersService, 'getMemberWithHisGroups', function (nickname, callback) { callback(null, socratesMember); });
      // and that the subscriber also exists
      sinon.stub(subscriberstore, 'getSubscriber', function (id, callback) { callback(null, socratesSubscriber); });
      appWithSocratesMember
        .post('/submit')
        .send('id=0815&firstname=A&lastname=B')
        .send('nickname=nickerinack')
        .send('email=here@there.org')
        .expect(302)
        .expect('location', '/', function (err) {
          expect(subscriberSave.called).to.be(false);
          expect(notificationCall.called).to.be(false);
          done(err);
        });
    });

    it('saves a new SoCraTes member and a new subscriber and triggers notification sending', function (done) {
      sinon.stub(membersService, 'isValidNickname', function (nickname, callback) { callback(null, true); });
      sinon.stub(membersService, 'isValidEmail', function (nickname, callback) { callback(null, true); });
      sinon.stub(memberstore, 'allMembers', function (callback) { callback(null, [softwerkskammerMember, socratesMember]); });
      sinon.stub(memberstore, 'saveMember', function (member, callback) { callback(null); });
      var subscriberSave = sinon.stub(subscriberstore, 'saveSubscriber', function (subscriber, callback) { callback(null); });
      var notificationCall = sinon.stub(socratesNotifications, 'newSoCraTesMemberRegistered', function () { return undefined; });

      // the following stub indicates that the member does not exist yet
      sinon.stub(groupsAndMembersService, 'getMemberWithHisGroups', function (nickname, callback) { callback(null); });
      // and that the subscriber does not exist either
      sinon.stub(subscriberstore, 'getSubscriber', function (id, callback) { callback(null); });
      appWithSocratesMember
        .post('/submit')
        .send('id=0815&firstname=A&lastname=B')
        .send('nickname=nickerinack')
        .send('email=here@there.org')
        .expect(302)
        .expect('location', '/', function (err) {
          expect(subscriberSave.called).to.be(true);
          expect(notificationCall.called).to.be(true);
          done(err);
        });
    });

  });

});