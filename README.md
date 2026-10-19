# 未来制造虚拟仿真实验 · 三维教学图谱

[打开在线演示](https://jarvisopen.github.io/future-manufacturing-lab/)

围绕轴与轴套柔性产线的设计、调试与优化，展示五层教学内容及完整关联：

1. 实验培养目标
2. 能力目标
3. 实验任务
4. 知识与 AI 应用
5. 产业数据与案例依据

当前版本 1.1.1，包含 34 个节点、92 条有向关系、6 个 AI 应用节点。

## 使用

- 拖动旋转、滚轮缩放、右键平移，支持立体、正视和俯视切换。
- 点击节点查看详情，默认追溯所有相关上下游节点，贯通五层。
- 右侧包含关联、能力阶梯、学习记录与资料。
- 实验前、实验中、实验后的介绍以具体产线任务展开。
- 页面“导入数据”支持 Excel、CSV、JSON；“导出配置”保存当前配置。

[下载 Excel 导入模板](data/graph-template.xlsx) · [查看 JSON 数据](data/graph-data.json)

## 本地运行

需要 Python 3 和支持 WebGL 的浏览器。完整下载仓库后，双击 Mac 或 Windows 启动文件，也可运行：

```sh
python3 run-demo.py
```

启动器会打开浏览器；运行期间保留终端，按 Ctrl+C 停止。前端库已经包含，无需 npm 安装。

## 部署与数据

GitHub Pages 从 main 分支根目录发布。推送更新后自动重新部署，.nojekyll 保留原始静态文件。

这是前端交互演示。配置保存于当前浏览器，不会因本地导入自动发布到网站；更新公开默认内容需提交 data/graph-data.json。AI 服务、业务数据库、账号权限和多人审核发布尚未接入。课程背景来自公开介绍，拓展 AI 任务不表示原课程已经部署这些功能。

## 文件

- app.js / styles.css / index.html：界面及三维交互
- graph-model.mjs：层级布局与跨层关系
- graph-core.js / table-reader.js：数据校验与导入
- data/：模板与教学图谱数据
- vendor/：Three.js、OrbitControls、JSZip，保留各自许可证

[课程背景资料](https://www.ilab-x.com/details/page?id=12665&isView=true)
