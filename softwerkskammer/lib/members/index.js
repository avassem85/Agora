'use strict';

const async = require('async');
const R = require('ramda');
const Form = require('multiparty').Form;

const beans = require('simple-configure').get('beans');
const validation = beans.get('validation');
const Member = beans.get('member');
const Group = beans.get('group');
const membersService = beans.get('membersService');
const memberstore = beans.get('memberstore');
const groupsAndMembersService = beans.get('groupsAndMembersService');
const groupsService = beans.get('groupsService');
const groupstore = beans.get('groupstore');
const activitiesService = beans.get('activitiesService');
const misc = beans.get('misc');
const statusmessage = beans.get('statusmessage');
const notifications = beans.get('notifications');

function memberSubmitted(req, res, next) {
  function notifyNewMemberRegistration(member, subscriptions) {
    // must be done here, not in Service to avoid circular deps
    notifications.newMemberRegistered(member, subscriptions);
  }

  groupsAndMembersService.updateAndSaveSubmittedMemberWithSubscriptions(req.user, req.body, res.locals.accessrights, notifyNewMemberRegistration, (err, nickname) => {
    if (err) { return next(err); }

    if (nickname) {
      statusmessage.successMessage('message.title.save_successful', 'message.content.members.saved').putIntoSession(req);
      return res.redirect('/members/' + encodeURIComponent(nickname));
    }

    return res.redirect('/members');
  });
}

function tagsFor(callback) {
  memberstore.allMembers((err, members) => {
    callback(err, membersService.toWordList(members).map(wordlist => wordlist.text).sort());
  });
}

const app = misc.expressAppIn(__dirname);

app.get('/', (req, res, next) => {
  memberstore.allMembers((err, members) => {
    if (err) { return next(err); }
    async.each(members, membersService.putAvatarIntoMemberAndSave, err1 => {
      if (err1) { return next(err1); }
      res.render('index', {members, wordList: membersService.toWordList(members)});
    });
  });
});

app.get('/interests', (req, res, next) => {
  const casesensitive = req.query.casesensitive ? '' : 'i';
  memberstore.getMembersWithInterest(req.query.interest, casesensitive, (err, members) => {
    if (err) { return next(err); }
    async.each(members, membersService.putAvatarIntoMemberAndSave, err1 => {
      if (err1) { return next(err1); }
      res.render('indexForTag', {
        interest: req.query.interest,
        members,
        wordList: membersService.toWordList(members)
      });
    });
  });
});

app.get('/checknickname', (req, res) => {
  misc.validate(req.query.nickname, req.query.previousNickname, membersService.isValidNickname, res.end);
});

app.get('/checkemail', (req, res) => {
  misc.validate(req.query.email, req.query.previousEmail, membersService.isValidEmail, res.end);
});

app.get('/new', (req, res, next) => {
  if (req.user.member) {
    return res.redirect('/members/');
  }
  async.parallel(
    {
      allGroups: callback => groupsService.getAllAvailableGroups(callback),
      alle: callback => groupstore.getGroup('alle', callback),
      commercial: callback => groupstore.getGroup('commercial', callback),
      allTags: callback => tagsFor(callback)
    },
    (err, results) => {
      if (err) { return next(err); }
      const allGroups = results.allGroups;
      res.render('edit', {
        member: new Member().initFromSessionUser(req.user),
        regionalgroups: groupsService.combineSubscribedAndAvailableGroups([results.alle, results.commercial], Group.regionalsFrom(allGroups)),
        themegroups: groupsService.combineSubscribedAndAvailableGroups([results.alle, results.commercial], Group.thematicsFrom(allGroups)),
        tags: results.allTags
      });
    }
  );
});

app.get('/edit/:nickname', (req, res, next) => {
  async.parallel(
    {
      member: callback => { groupsAndMembersService.getMemberWithHisGroups(req.params.nickname, callback); },
      allGroups: callback => { groupsService.getAllAvailableGroups(callback); },
      allTags: callback => tagsFor(callback)
    },
    (err, results) => {
      if (err) { return next(err); }
      const member = results.member;
      if (err || !member) { return next(err); }
      if (!res.locals.accessrights.canEditMember(member)) {
        return res.redirect('/members/' + encodeURIComponent(member.nickname()));
      }
      const allGroups = results.allGroups;
      res.render('edit', {
        member,
        regionalgroups: groupsService.combineSubscribedAndAvailableGroups(member.subscribedGroups, Group.regionalsFrom(allGroups)),
        themegroups: groupsService.combineSubscribedAndAvailableGroups(member.subscribedGroups, Group.thematicsFrom(allGroups)),
        tags: results.allTags
      });
    }
  );
});

app.post('/delete', (req, res, next) => {
  const nicknameOfEditMember = req.body.nickname;
  groupsAndMembersService.getMemberWithHisGroups(nicknameOfEditMember, (err, member) => {
    if (err || !member) { return next(err); }
    if (!res.locals.accessrights.canDeleteMember(member)) {
      return res.redirect('/members/' + encodeURIComponent(member.nickname()));
    }
    if (R.isEmpty(member.subscribedGroups)) {
      return memberstore.isSoCraTesSubscriber(member.id(), (err1, isSubscriber) => {
        if (!err && isSubscriber) {
          member.state.socratesOnly = true;
          return memberstore.saveMember(member, err2 => {
            if (err2) { return next(err2); }
            statusmessage.successMessage('message.title.save_successful', 'message.content.members.saved').putIntoSession(req);
            res.redirect('/members/' + encodeURIComponent(member.nickname()));
          });
        }
        memberstore.removeMember(member, err2 => {
          if (err2) { return next(err2); }
          statusmessage.successMessage('message.title.save_successful', 'message.content.members.deleted').putIntoSession(req);
          res.redirect('/members/');
        });
      });
    }
    statusmessage.errorMessage('message.title.problem', 'message.content.members.hasSubscriptions').putIntoSession(req);
    res.redirect('/members/edit/' + encodeURIComponent(member.nickname()));
  });
});

app.post('/submit', (req, res, next) => {
  async.parallel(
    [
      callback => {
        // we need this helper function (in order to have a closure?!)
        const validityChecker = (nickname, cb) => membersService.isValidNickname(nickname, cb);
        validation.checkValidity(req.body.previousNickname, req.body.nickname, validityChecker, req.i18n.t('validation.nickname_not_available'), callback);
      },
      callback => {
        // we need this helper function (in order to have a closure?!)
        const validityChecker = (email, cb) => membersService.isValidEmail(email, cb);
        validation.checkValidity(req.body.previousEmail, req.body.email, validityChecker, req.i18n.t('validation.duplicate_email'), callback);
      },
      callback => {
        const errors = validation.isValidForMember(req.body);
        callback(null, errors);
      }
    ],
    (err, errorMessages) => {
      if (err) { return next(err); }
      const realErrors = R.flatten(errorMessages).filter(message => !!message);
      if (realErrors.length === 0) {
        return memberSubmitted(req, res, next);
      }
      return res.render('../../../views/errorPages/validationError', {errors: realErrors});
    }
  );
});

app.post('/submitavatar', (req, res, next) => {
  new Form().parse(req, (err, fields, files) => {
    const nickname = fields.nickname[0];
    if (err || !files || files.length < 1) {
      return res.redirect('/members/' + nickname);
    }
    const params = {
      geometry: fields.w[0] + 'x' + fields.h[0] + '+' + fields.x[0] + '+' + fields.y[0],
      scale: fields.scale[0],
      angle: fields.angle[0]
    };
    membersService.saveCustomAvatarForNickname(nickname, files, params, err1 => {
      if (err1) { return next(err1); }
      res.redirect('/members/' + encodeURIComponent(nickname)); // Es fehlen Prüfungen im Frontend
    });
  });
});

app.post('/deleteAvatarFor', (req, res, next) => {
  const nicknameOfEditMember = req.body.nickname;
  memberstore.getMember(nicknameOfEditMember, (err, member) => {
    if (err) { return next(err); }
    if (res.locals.accessrights.canEditMember(member)) {
      return membersService.deleteCustomAvatarForNickname(nicknameOfEditMember, err1 => {
        if (err1) { return next(err1); }
        res.redirect('/members/' + encodeURIComponent(nicknameOfEditMember));
      });
    }
    res.redirect('/members/' + encodeURIComponent(nicknameOfEditMember));
  });

});

app.get('/:nickname', (req, res, next) => {
  groupsAndMembersService.getMemberWithHisGroups(req.params.nickname, (err, member, subscribedGroups) => {
    if (err || !member) { return next(err); }
    activitiesService.getPastActivitiesOfMember(member, (err1, activities) => {
      if (err1) { return next(err1); }
      res.render('get', {member, pastActivities: activities, subscribedGroups});
    });
  });
});

module.exports = app;
