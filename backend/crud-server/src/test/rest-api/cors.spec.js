const { Api, expect } = require('./fixture');

describe('Conduits resource server REST API', () => {
  context('Operational features', () => {
    it('supports CORS', async () => {
      let workingCorsResponse = undefined;
      workingCorsResponse = await Api().options('/');
      expect(workingCorsResponse).to.have.status(204);
      expect(workingCorsResponse).to.have.header(
        'access-control-allow-methods',
        'GET,HEAD,PUT,PATCH,POST,DELETE'
      );
    });
  });
});
