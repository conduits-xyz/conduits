import React from 'react';

import { renderComponentUnderTest } from 'mocks';
import { CreateConduitForm } from './form';

// TODO:
// - Read first:
//  - https://testing-library.com/docs/guide-which-query
//  - https://kentcdodds.com/blog/common-mistakes-with-react-testing-library
// - And then:
//  - rewrite all the tests by avoiding `querySelector`; if it is impossible
//    to get an element, then the underlying code is not 'testable' and
//    should be fixed there. These tests as written are brittle and will
//    break, making them a liability than adding value.
describe('Create Conduit Form', () => {
  const renderForm = () => {
    const changeView = jest.fn();

    // eslint-disable-next-line testing-library/render-result-naming-convention
    const result = renderComponentUnderTest(
      <CreateConduitForm changeView={changeView} />
    );

    return {
      container: result.container,
    };
  };

  xit('should have a heading', async () => {
    const { container } = renderForm();

    // eslint-disable-next-line testing-library/no-container
    const heading = container.querySelector('form>h2');
    expect(heading).toHaveTextContent(/create conduit/i);
  });

  xit('should have text fields', async () => {
    const { container } = renderForm();

    // Object Key for external service
    // eslint-disable-next-line testing-library/no-container
    const suriObjectKey = container.querySelector('form>input[name="suriObjectKey"]');
    expect(suriObjectKey).toBeInTheDocument();

    // Description for conduit
    // eslint-disable-next-line testing-library/no-container
    const description = container.querySelector('form>input[name="description"]');
    expect(description).toBeInTheDocument();
    // TODO : test aria-describedby when implementing ARIA compliance
    // expect(description).toHaveDescription(//);
  });

  xit('should have drop-down for service type', async () => {
    const { container } = renderForm();

    // eslint-disable-next-line testing-library/no-container
    const serviceType = container.querySelector('form>select[name="suriType"]');
    expect(serviceType).toBeInTheDocument();
  });

  xit('should have checkboxes for allowed methods', async () => {
    const { container } = renderForm();

    // GET method
    // eslint-disable-next-line testing-library/no-container
    const get = container.querySelector(
      'form>div>div>div>label>input[value="GET"]'
    );
    expect(get).toBeInTheDocument();
    // GET method should be checked by default
    expect(get).toBeChecked();

    // POST method
    // eslint-disable-next-line testing-library/no-container
    const post = container.querySelector(
      'form>div>div>div>label>input[value="POST"]'
    );
    expect(post).toBeInTheDocument();

    // PATCH method
    // eslint-disable-next-line testing-library/no-container
    const patch = container.querySelector(
      'form>div>div>div>label>input[value="PATCH"]'
    );
    expect(patch).toBeInTheDocument();

    // DELETE method
    // eslint-disable-next-line testing-library/no-container
    const del = container.querySelector(
      'form>div>div>div>label>input[value="DELETE"]'
    );
    expect(del).toBeInTheDocument();
  });

  xit('should have radio buttons for conduit status', async () => {
    const { container } = renderForm();

    // active
    // eslint-disable-next-line testing-library/no-container
    const active = container.querySelector(
      'form>div>div>span>label>input[value="active"]'
    );
    expect(active).toBeInTheDocument();

    // inactive
    // eslint-disable-next-line testing-library/no-container
    const inactive = container.querySelector(
      'form>div>div>span>label>input[value="inactive"]'
    );
    expect(inactive).toBeInTheDocument();
  });

  xit('should have submit and cancel buttons', async () => {
    const { container } = renderForm();

    // submit
    // eslint-disable-next-line testing-library/no-container
    const submit = container.querySelector(
      'form>button[type="submit"]'
    );
    expect(submit).toBeInTheDocument();
    expect(submit).toHaveTextContent(/create conduit/i);

    // cancel
    // eslint-disable-next-line testing-library/no-container
    const cancel = container.querySelector(
      'form>button[type="button"]'
    );
    expect(cancel).toBeInTheDocument();
    expect(cancel).toHaveTextContent(/cancel/i);
  });
});
