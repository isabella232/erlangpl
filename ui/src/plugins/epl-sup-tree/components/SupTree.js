// @flow
import React, { Component } from 'react';
import { connect } from 'react-redux';
import Viva from 'vivagraphjs';
import difference from 'lodash/difference';
import { Motion, spring } from 'react-motion';
import { ListGroup, ListGroupItem } from 'react-bootstrap';
import { push } from 'react-router-redux';

import { send } from '../../../sockets';
import './SupTree.css';

const COLORS = {
  supervisor: '#227A50',
  worker: '#1F79B7'
};

class SupTree extends Component {
  div: any;

  state: {
    graphics: any,
    graph: any,
    layout: any,
    renderer: any,
    events: any,

    collapse: boolean,
    height: Array<number>,
    selected: { id: string, color: number, type: string },
    appsNodes: Array<*>,
    apps: Array<string>,
    first: boolean,
    all: Array<string>
  };

  constructor(props: any) {
    super(props);
    this.state = {
      graphics: null,
      graph: null,
      layout: null,
      renderer: null,
      events: null,

      collapse: true,
      height: [0, 50],
      selected: { id: 'Applications', color: 0, type: '' },
      appsNodes: [],
      apps: [],
      all: [],
      first: true
    };
  }

  componentDidMount() {
    const graph = Viva.Graph.graph();
    const graphics = Viva.Graph.View.webglGraphics();

    graphics
      .node(node => {
        const size = node.data && node.data.type === 'worker' ? 10 : 15;
        const color =
          node.data && COLORS.hasOwnProperty(node.data.type)
            ? COLORS[node.data.type]
            : '#000';

        return Viva.Graph.View.webglSquare(size, color);
      })
      .link(link => {
        return Viva.Graph.View.webglLine('#808080');
      });

    const layout = Viva.Graph.Layout.forceDirected(graph, {
      springLength: 1,
      springCoeff: 0.0001,
      dragCoeff: 0.1,
      gravity: -0.5
    });

    const renderer = Viva.Graph.View.renderer(graph, {
      container: this.div,
      graphics,
      layout,
      prerender: 1200
    });

    const events = Viva.Graph.webglInputEvents(graphics, graph);

    events.click(({ id }) => this.selectNode(id));

    setTimeout(() => {
      this.setState({ renderer, graph, graphics, layout, events }, () =>
        this.propagateGraph()
      );
    }, 0);
  }

  selectNode(id: string, center: ?boolean) {
    const { layout, renderer, selected, graphics } = this.state;

    const oldNode = graphics.getNodeUI(selected.id);
    if (oldNode) {
      oldNode.color = selected.color;
    }

    const node = graphics.getNodeUI(id);
    const color = node.color;
    node.color = 0xdf307dff;

    if (center) {
      const { x, y } = layout.getNodePosition(id);
      renderer.moveTo(x, y);
    }

    send('epl_st_EPL', id);

    this.setState({ selected: { id, color, type: node.node.data.type } });
  }

  mapChild(child, parent) {
    const { all, graph } = this.state;

    if (all.indexOf(child.id) < 0) {
      graph.addNode(child.id, { ...child });
      graph.addLink(child.id, parent.id);
    }

    return [child.id].concat(
      child.children.reduce((acc, a) => acc.concat(this.mapChild(a, child)), [])
    );
  }

  propagateGraph(p) {
    const props = p || this.props;

    if (!this.state.graph) return;

    const { all } = this.state;

    let appsNodes = []; //this.state.appsNodes;

    const list = Object.keys(props.tree).reduce((acc, app) => {
      const parent = props.tree[app];
      if (Object.keys(parent).length) {
        if (all.indexOf(parent.id) < 0) {
          const app = this.state.graph.addNode(parent.id, { ...parent });
          if (!this.state.appsNodes.includes(app)) {
            appsNodes.push(app);
          }
        }

        return acc
          .concat(parent.id)
          .concat(
            parent.children.reduce(
              (acc, child) => acc.concat(this.mapChild(child, parent)),
              []
            )
          );
      }

      return acc;
    }, []);

    if (this.state.first && Object.keys(props.tree).length) {
      this.state.renderer.run();
      this.setState({ first: false });
    }

    // simple diffing to remove non existing nodes
    difference(all, list).forEach(id => this.state.graph.removeNode(id));

    appsNodes.forEach(app => this.state.layout.pinNode(app, true));
    this.setState({
      appsNodes,
      apps: Object.keys(props.tree),
      all: list
    });
  }

  componentWillReceiveProps(props) {
    this.propagateGraph(props);
  }

  handleAppClick(app: string, id: string) {
    this.toggleTree(id, this.state.apps.includes(app));
    this.setState(({ apps }) => {
      if (apps.includes(app)) {
        const index = apps.indexOf(app);
        return { apps: [...apps.slice(0, index), ...apps.slice(index + 1)] };
      } else {
        return { apps: [...apps, app].sort() };
      }
    });
  }

  changeColorNode(color: number, hide: boolean): number {
    // set to 00 - transparent
    // set to ff - solid
    return parseInt(color.toString(16).slice(0, 6) + (hide ? '00' : 'ff'), 16);
  }

  changeColorLink(color: number, hide: boolean): number {
    if (hide) {
      return parseInt(color.toString(16).slice(0, 6) + '00', 16);
    } else {
      return parseInt('808080ff', 16);
    }
  }

  toggleTree(id: string, hide: boolean) {
    const node = this.state.graphics.getNodeUI(id);
    if (node) {
      node.color = this.changeColorNode(node.color, hide);
      node.node.links.forEach(({ id }) => {
        const link = this.state.graphics.getLinkUI(id);
        link.color = this.changeColorLink(link.color, hide);
      });
      node.node.data.children.forEach(n => this.toggleTree(n.id, hide));
    }
  }

  selectAll = () => {
    this.setState((state, { tree }) => ({
      apps: Object.keys(tree).map(app => {
        this.toggleTree(tree[app].id, false);
        return app;
      })
    }));
  };

  clearAll = () => {
    this.state.apps.forEach(a => this.toggleTree(this.props.tree[a].id, true));
    this.setState({ apps: [] });
  };

  toggleCollapse = () => {
    this.setState(({ collapse, hEnd, hStart }) => ({
      collapse: !collapse,
      height: collapse ? [50, 0] : [0, 50]
    }));
  };

  addToTimeline = (pid: string) => {
    send('epl_timeline_EPL', JSON.stringify(['add', pid]));
    this.props.pushTimelinePid(pid);
    this.props.push(`/timeline/${pid}`);
  };

  render() {
    return (
      <div className="SupTree">
        {this.state.first &&
          <div className="loader">
            <div className="text-center">
              <div className="spinner">
                <div className="bounce1" />
                <div className="bounce2" />
                <div className="bounce3" />
              </div>
              <span>Creating graph</span>
            </div>
          </div>}

        <div className="graph" ref={node => (this.div = node)} />
        <div className="side-panel">
          <div className="head">
            {this.state.selected.id !== 'Applications' &&
              <i
                onClick={() => this.addToTimeline(this.state.selected.id)}
                className="timeline fa fa-repeat"
              />}
            <h4
              onClick={this.toggleCollapse}
              className="text-center"
              style={{
                color: COLORS[this.state.selected.type] || 'inherit'
              }}
            >
              {this.state.selected.id}
            </h4>
            <i
              onClick={this.toggleCollapse}
              className={`collapse fa fa-angle-${this.state.collapse
                ? 'down'
                : 'up'}`}
            />
          </div>

          <Motion
            defaultStyle={{ height: this.state.height[0] }}
            style={{ height: spring(this.state.height[1]) }}
            children={({ height }) =>
              <div className="side-content" style={{}}>
                {!this.state.first &&
                  <div
                    className="applications"
                    style={{ height: `calc(${height}%)` }}
                  >
                    <ListGroup style={{ margin: '10px 0px' }}>
                      <ListGroupItem className="application-link">
                        <button onClick={this.selectAll}>Select all</button>
                        <button onClick={this.clearAll}>Clear all</button>
                      </ListGroupItem>
                      {Object.keys(this.props.tree).map(
                        (app, key) =>
                          Object.keys(this.props.tree[app]).length
                            ? <ListGroupItem
                                key={key}
                                className="application-link"
                              >
                                <input
                                  type="checkbox"
                                  checked={this.state.apps.includes(app)}
                                  onChange={() =>
                                    this.handleAppClick(
                                      app,
                                      this.props.tree[app].id
                                    )}
                                />
                                <a
                                  style={{ marginLeft: '5px' }}
                                  onClick={() =>
                                    this.selectNode(
                                      this.props.tree[app].id,
                                      true
                                    )}
                                >
                                  {app}
                                </a>
                              </ListGroupItem>
                            : <ListGroupItem
                                key={key}
                                className="application-link"
                              >
                                <span style={{ marginLeft: '17px' }}>
                                  {app}
                                </span>
                              </ListGroupItem>
                      )}
                    </ListGroup>
                  </div>}

                <div
                  className="node-info"
                  style={{ height: `calc(${100 - height}%)` }}
                >
                  <pre style={{ height: '100%' }}>
                    <code>
                      {this.props.nodeInfo &&
                        JSON.stringify(this.props.nodeInfo, null, 2)}
                    </code>
                  </pre>
                </div>
              </div>}
          />
        </div>
      </div>
    );
  }
}

import * as actions from '../actions';

export default connect(
  state => ({
    tree: state.eplSupTree.tree,
    nodeInfo: state.eplSupTree.nodeInfo
  }),
  { push, pushTimelinePid: actions.pushTimelinePid }
)(SupTree);
